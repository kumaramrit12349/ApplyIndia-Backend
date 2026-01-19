"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signUpUser = signUpUser;
exports.signInUser = signInUser;
exports.confirmSignUp = confirmSignUp;
exports.resendConfirmationCode = resendConfirmationCode;
// src/services/authService.ts
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const errorUtils_1 = require("../utils/errorUtils"); // Use your utility function for errors
const cognito = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
    region: process.env.AWS_REGION,
});
async function signUpUser(data) {
    const { email, password, given_name, family_name, gender } = data;
    // Basic validation
    if (!email || !password || !given_name || !family_name || !gender) {
        (0, errorUtils_1.createThrowError)(400, "BadRequest", "All fields are required", { email });
    }
    if (password.includes(email) ||
        password.includes(given_name) ||
        password.includes(family_name)) {
        (0, errorUtils_1.createThrowError)(400, "BadRequest", "Password cannot contain personal info", { email });
    }
    const input = {
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
            { Name: "email", Value: email },
            { Name: "given_name", Value: given_name },
            { Name: "family_name", Value: family_name },
            { Name: "gender", Value: gender },
        ],
    };
    const command = new client_cognito_identity_provider_1.SignUpCommand(input);
    try {
        const response = await cognito.send(command);
        return response;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("authService.ts", "signUpUser", error, "AWS Cognito signup error", "", { data });
        if (error.name === "UsernameExistsException") {
            (0, errorUtils_1.createThrowError)(400, "Conflict", "User already exists with this email", {
                email,
            });
        }
        (0, errorUtils_1.createThrowError)(500, "InternalServerError", error.message || "Failed to register user", { email });
    }
}
async function signInUser(email, password) {
    if (!email || !password) {
        (0, errorUtils_1.createThrowError)(400, "BadRequest", "Email and password required", {
            email,
        });
    }
    const input = {
        AuthFlow: client_cognito_identity_provider_1.AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: process.env.COGNITO_CLIENT_ID,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
        },
    };
    const command = new client_cognito_identity_provider_1.InitiateAuthCommand(input);
    try {
        const response = await cognito.send(command);
        if (!response.AuthenticationResult) {
            (0, errorUtils_1.createThrowError)(401, "Unauthorized", "Authentication failed", { email });
        }
        return response.AuthenticationResult; // { AccessToken, IdToken, RefreshToken, ... }
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("authService.ts", "signInUser", error, "AWS Cognito sign-in error", "", { email });
        // Re-throw so the route catch block can map error.name to HTTP status/message
        throw error;
    }
}
async function confirmSignUp(email, code) {
    if (!email || !code) {
        (0, errorUtils_1.createThrowError)(400, "BadRequest", "Email and code are required", { email });
    }
    const cmd = new client_cognito_identity_provider_1.ConfirmSignUpCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
    });
    try {
        await cognito.send(cmd); // 200 OK if success
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("authService.ts", "confirmSignUp", error, "AWS Cognito confirm sign-up error", "", { email });
        throw error;
    }
}
async function resendConfirmationCode(email) {
    if (!email) {
        (0, errorUtils_1.createThrowError)(400, "BadRequest", "Email is required", { email });
    }
    const cmd = new client_cognito_identity_provider_1.ResendConfirmationCodeCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
    });
    try {
        await cognito.send(cmd);
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("authService.ts", "resendConfirmationCode", error, "AWS Cognito resend confirmation code error", "", { email });
        throw error;
    }
}
