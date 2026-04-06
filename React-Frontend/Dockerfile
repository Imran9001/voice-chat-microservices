
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the package.json first to cache dependencies
COPY package.json package-lock.json* ./

# Install all the React/MUI dependencies
RUN npm install


COPY . .

# Compile the Vite project into static HTML/JS files
RUN npm run build


FROM nginx:alpine

# Remove the default Nginx index.html landing page
RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html

# The default port for HTTP web traffic
EXPOSE 80

# Start the Nginx web server
CMD ["nginx", "-g", "daemon off;"]