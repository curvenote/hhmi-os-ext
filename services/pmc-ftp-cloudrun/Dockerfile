FROM node:22-bullseye-slim

RUN apt-get -y update
RUN npm update -g npm

WORKDIR /usr/app

COPY index.js package.json package-lock.json ./
RUN npm install

CMD ["npm", "run", "start"]