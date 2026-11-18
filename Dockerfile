FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY index.html access.html privacy.html terms.html privacidad.html terminos.html ./
EXPOSE 8080
CMD ["node", "server/index.mjs"]
