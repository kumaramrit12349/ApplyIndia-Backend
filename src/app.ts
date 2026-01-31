import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import routes from "./routes";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler";

const app = express();

/* ===============================
   SECURITY & BASIC MIDDLEWARES
================================ */
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

/* ===============================
   CORS CONFIG (IMPORTANT)
================================ */
const allowedOrigins = [
  "http://localhost:5173",
  "https://applyindia.online",
  "https://dev.applyindia.online",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman / server-to-server

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* ===============================
   PREFLIGHT HANDLER (FIX)
================================ */
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

/* ===============================
   ROUTES
================================ */
app.use(routes);

/* ===============================
   ERROR HANDLERS
================================ */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
