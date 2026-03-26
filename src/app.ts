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
   CORS CONFIG (FIXED)
================================ */
const allowedOrigins = [
  "http://localhost:5173",
  "https://applyindia.online",
  "https://dev.applyindia.online",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow non-browser requests (Postman, server-to-server)
      if (!origin) return callback(null, true);

      // allow localhost & 127.0.0.1 (any port)
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      ) {
        return callback(null, true);
      }

      // allow whitelisted domains
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("Blocked by CORS:", origin); // 🔥 debug
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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