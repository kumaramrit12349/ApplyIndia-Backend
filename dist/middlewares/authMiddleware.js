"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateTokenAndEmail = exports.authenticateMe = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
const env_1 = require("../config/env");
const client = (0, jwks_rsa_1.default)({
    jwksUri: `https://cognito-idp.${env_1.COGNITO_CONFIG.region}.amazonaws.com/${env_1.COGNITO_CONFIG.userPoolId}/.well-known/jwks.json`,
});
async function getKey(header, callback) {
    try {
        const key = await client.getSigningKey(header.kid);
        const signingKey = key.getPublicKey(); // <-- use this
        callback(null, signingKey);
    }
    catch (err) {
        callback(err, undefined);
    }
}
// For protecting APIs with the access token
const authenticateToken = (req, res, next) => {
    const accessToken = req?.cookies?.accessToken;
    if (!accessToken) {
        return res.status(401).json({ error: "Access denied" });
    }
    jsonwebtoken_1.default.verify(accessToken, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
        if (err) {
            console.error("JWT verify error (accessToken):", err);
            return res.status(403).json({ error: "Invalid token" });
        }
        req.user = decoded;
        next();
    });
};
exports.authenticateToken = authenticateToken;
// authMiddleware.ts (same file)
const authenticateMe = (req, res, next) => {
    const idToken = req?.cookies?.idToken;
    if (!idToken) {
        return res.status(401).json({ error: "Access denied" });
    }
    jsonwebtoken_1.default.verify(idToken, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
        if (err) {
            console.error("JWT verify error (idToken /me):", err);
            return res.status(403).json({ error: "Invalid token" });
        }
        req.user = decoded;
        next();
    });
};
exports.authenticateMe = authenticateMe;
const ALLOWED_EMAILS = [
    "support@applyindia.online",
];
const isEmailAllowed = (email) => {
    if (!email)
        return false;
    if (Array.isArray(email)) {
        return email.some(e => ALLOWED_EMAILS.includes(e));
    }
    return ALLOWED_EMAILS.includes(email);
};
const authenticateTokenAndEmail = (req, res, next) => {
    const accessToken = req?.cookies?.accessToken;
    if (!accessToken) {
        return res.status(401).json({ error: "Access denied" });
    }
    jsonwebtoken_1.default.verify(accessToken, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
        if (err) {
            console.error("JWT verify error (accessToken):", err);
            return res.status(403).json({ error: "Invalid token" });
        }
        // 🔐 EMAIL AUTHORIZATION (string | string[])
        if (!isEmailAllowed(decoded?.email)) {
            return res.status(403).json({ error: "You need Admin Access for it!" });
        }
        req.user = decoded;
        next();
    });
};
exports.authenticateTokenAndEmail = authenticateTokenAndEmail;
