# Use official Node LTS as the build image
FROM node:18-alpine AS builder

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# ------------------------------------
# Second stage: smaller, production image
# ------------------------------------

FROM node:18-alpine

WORKDIR /usr/src/app

# Copy only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built files from builder
COPY --from=builder /usr/src/app/dist ./dist

# Expose the port your app listens on
EXPOSE 3000

# Start the app
CMD ["node", "dist/index.js"]
