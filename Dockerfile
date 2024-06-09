# Usa una imagen base de Node.js
FROM node:20-slim

# Instala las dependencias necesarias para Puppeteer
RUN apt-get update && apt-get install -y \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libnss3 \
    lsb-release \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Establece el directorio de trabajo en el contenedor
WORKDIR /app

# Copia el package.json y package-lock.json
COPY package*.json ./

# Instala las dependencias del proyecto
RUN npm install
RUN npm i cors

# Copia el resto de los archivos del proyecto
COPY . .

# Expone el puerto que utiliza la aplicación
EXPOSE 8000

# Comando para ejecutar la aplicación
CMD ["npm", "start"]
