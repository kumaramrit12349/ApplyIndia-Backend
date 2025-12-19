import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import routes from "./routes";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler";

const app = express();

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: "http://localhost:5173", // your React origin
    credentials: true,               // allow cookies
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
