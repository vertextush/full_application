FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY app.js ./
COPY router.js ./
COPY index.html ./
COPY styles.css ./

EXPOSE 8080

CMD ["npm", "start"]
