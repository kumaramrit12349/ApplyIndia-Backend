// src/services/authService.ts
import {
  AuthFlowType,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createThrowError, logErrorLocation } from "../utils/errorUtils";
import { RegisterRequest } from "../db_schema/Cognito/CongnitoInterface";
import { insertItemIntoDynamoDB } from "../dynamoDB_CRUD/insertData";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../db_schema/shared/SharedConstant";
import { IUser } from "../db_schema/User/UserInterface";
import { updateItemDynamoDB } from "../dynamoDB_CRUD/updateData";
import { fetchDynamoDB } from "../Interpreter/dynamoDB/fetchCalls";
import { UpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

export async function signUpUser(data: RegisterRequest) {
  const { email, password, given_name, family_name, gender } = data;
  // Basic validation
  if (!email || !password || !given_name || !family_name || !gender) {
    createThrowError(400, "BadRequest", "All fields are required", { email });
  }
  if (
    password.includes(email) ||
    password.includes(given_name) ||
    password.includes(family_name)
  ) {
    createThrowError(
      400,
      "BadRequest",
      "Password cannot contain personal info",
      { email }
    );
  }
  const input = {
    ClientId: process.env.COGNITO_CLIENT_ID!,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "given_name", Value: given_name },
      { Name: "family_name", Value: family_name },
      { Name: "gender", Value: gender },
    ],
  };
  const command = new SignUpCommand(input);
  try {
    const response = await cognito.send(command);

    // Store in DynamoDB
    if (response.UserSub) {
      const userData = {
        ...data,
        sub: response.UserSub,
      };
      // remove password before storing in DynamoDB
      delete (userData as any).password;

      // Ensure state is uppercase if provided
      if (userData.state) {
        userData.state = userData.state.toUpperCase();
      }

      await insertItemIntoDynamoDB(ALL_TABLE_NAMES.User, userData);
    }

    return response;
  } catch (error: any) {
    logErrorLocation(
      "authService.ts",
      "signUpUser",
      error,
      "AWS Cognito signup error",
      "",
      { data }
    );
    if (error.name === "UsernameExistsException") {
      createThrowError(400, "Conflict", "User already exists with this email", {
        email,
      });
    }
    createThrowError(
      500,
      "InternalServerError",
      error.message || "Failed to register user",
      { email }
    );
  }
}

export async function signInUser(email: string, password: string) {
  if (!email || !password) {
    createThrowError(400, "BadRequest", "Email and password required", {
      email,
    });
  }
  const input = {
    AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
    ClientId: process.env.COGNITO_CLIENT_ID!,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  };
  const command = new InitiateAuthCommand(input);
  try {
    const response = await cognito.send(command);
    if (!response.AuthenticationResult) {
      createThrowError(401, "Unauthorized", "Authentication failed", { email });
    }
    return response.AuthenticationResult; // { AccessToken, IdToken, RefreshToken, ... }
  } catch (error: any) {
    logErrorLocation(
      "authService.ts",
      "signInUser",
      error,
      "AWS Cognito sign-in error",
      "",
      { email }
    );
    // Re-throw so the route catch block can map error.name to HTTP status/message
    throw error;
  }
}

export async function confirmSignUp(email: string, code: string) {
  if (!email || !code) {
    createThrowError(400, "BadRequest", "Email and code are required", { email });
  }
  const cmd = new ConfirmSignUpCommand({
    ClientId: process.env.COGNITO_CLIENT_ID!,
    Username: email,
    ConfirmationCode: code,
  });
  try {
    await cognito.send(cmd); // 200 OK if success
  } catch (error: any) {
    logErrorLocation(
      "authService.ts",
      "confirmSignUp",
      error,
      "AWS Cognito confirm sign-up error",
      "",
      { email }
    );
    throw error;
  }
}

export async function resendConfirmationCode(email: string) {
  if (!email) {
    createThrowError(400, "BadRequest", "Email is required", { email });
  }
  const cmd = new ResendConfirmationCodeCommand({
    ClientId: process.env.COGNITO_CLIENT_ID!,
    Username: email,
  });
  try {
    await cognito.send(cmd);
  } catch (error: any) {
    logErrorLocation(
      "authService.ts",
      "resendConfirmationCode",
      error,
      "AWS Cognito resend confirmation code error",
      "",
      { email }
    );
    throw error;
  }
}

export async function forgotPassword(email: string) {
  if (!email) {
    createThrowError(400, "BadRequest", "Email is required", { email });
  }
  const cmd = new ForgotPasswordCommand({
    ClientId: process.env.COGNITO_CLIENT_ID!,
    Username: email,
  });
  try {
    const response = await cognito.send(cmd);
    return response;
  } catch (error: any) {
    logErrorLocation(
      "authService.ts",
      "forgotPassword",
      error,
      "AWS Cognito forgot password error",
      "",
      { email }
    );
    throw error;
  }
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
) {
  if (!email || !code || !newPassword) {
    createThrowError(400, "BadRequest", "Email, code and new password are required", {
      email,
    });
  }
  const cmd = new ConfirmForgotPasswordCommand({
    ClientId: process.env.COGNITO_CLIENT_ID!,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
  try {
    const response = await cognito.send(cmd);
    return response;
  } catch (error: any) {
    logErrorLocation(
      "authService.ts",
      "resetPassword",
      error,
      "AWS Cognito reset password error",
      "",
      { email }
    );
    throw error;
  }
}

export async function updateProfile(accessToken: string, sub: string, data: Partial<IUser>) {
  // 1. Update Cognito (only specific fields)
  const cognitoAttributes = [];
  if (data.given_name) cognitoAttributes.push({ Name: "given_name", Value: data.given_name });
  if (data.family_name) cognitoAttributes.push({ Name: "family_name", Value: data.family_name });
  if (data.gender) cognitoAttributes.push({ Name: "gender", Value: data.gender });

  if (cognitoAttributes.length > 0) {
    const cmd = new UpdateUserAttributesCommand({
      AccessToken: accessToken,
      UserAttributes: cognitoAttributes,
    });
    try {
      await cognito.send(cmd);
    } catch (error: any) {
      logErrorLocation("authService.ts", "updateProfile (Cognito)", error, "AWS Cognito update error", "", { sub });
      // We might want to continue even if Cognito update fails, or throw
      // For now, if Cognito fails, we throw
      throw error;
    }
  }

  // 2. Update DynamoDB (all fields)
  const pk = TABLE_PK_MAPPER.User;
  const sk = `${TABLE_PK_MAPPER.User}${sub}`;

  // Ensure state is uppercase if provided
  if (data.state) {
    data.state = data.state.toUpperCase();
  }

  // Build update expression for DynamoDB
  const expressions: string[] = [];
  const expressionAttributeValues: any = {};
  const expressionAttributeNames: any = {};

  Object.entries(data).forEach(([key, value], index) => {
    if (key === "pk" || key === "sk" || key === "sub" || value === undefined) return;
    const nameKey = `#field${index}`;
    const valueKey = `:val${index}`;
    expressions.push(`${nameKey} = ${valueKey}`);
    expressionAttributeNames[nameKey] = key;
    expressionAttributeValues[valueKey] = value;
  });

  if (expressions.length > 0) {
    const updateItemParam = {
      Key: { pk, sk },
      UpdateExpression: "set " + expressions.join(", "),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    try {
      await updateItemDynamoDB(updateItemParam);
    } catch (error: any) {
      logErrorLocation("authService.ts", "updateProfile (DynamoDB)", error, "DynamoDB update error", "", { sub, data });
      throw error;
    }
  }
}

export async function getUserProfile(sub: string) {
  const pk = TABLE_PK_MAPPER.User;
  const sk = `${TABLE_PK_MAPPER.User}${sub}`;
  try {
    const results = await fetchDynamoDB(ALL_TABLE_NAMES.User, sk);
    return results.length > 0 ? (results[0] as IUser) : null;
  } catch (error: any) {
    logErrorLocation("authService.ts", "getUserProfile", error, "DynamoDB fetch error", "", { sub });
    throw error;
  }
}
