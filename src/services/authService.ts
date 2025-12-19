// src/services/authService.ts
import {
  AuthFlowType,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { RegisterRequest } from "../@types/auth";
import { createThrowError, logErrorLocation } from "../utils/errorUtils"; // Use your utility function for errors

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
