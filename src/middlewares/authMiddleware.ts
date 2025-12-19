import jwt from "jsonwebtoken";
import jwksClient, { SigningKey } from "jwks-rsa";
import { COGNITO_KEYS } from "../config/env";

const client = jwksClient({
  jwksUri: `https://cognito-idp.${COGNITO_KEYS.AWS_REGION}.amazonaws.com/${COGNITO_KEYS.USER_POOL_ID}/.well-known/jwks.json`,
});

async function getKey(header: any, callback: any) {
  try {
    const key: SigningKey = await client.getSigningKey(header.kid);
    const signingKey = key.getPublicKey(); // <-- use this
    callback(null, signingKey);
  } catch (err) {
    callback(err, undefined);
  }
}

export const authenticateToken = (req: any, res: any, next: any) => {
  const accessToken = req?.cookies?.accessToken;
  if (!accessToken) {
    return res.status(401).json({ error: "Access denied" });
  }
  jwt.verify(
    accessToken,
    getKey,
    { algorithms: ["RS256"] },
    (err: any, decoded: any) => {
      if (err) {
        console.error("JWT verify error:", err); // <--- log the real reason
        return res.status(403).json({ error: "Invalid token" });
      }
      req.user = decoded;
      next();
    }
  );
};
