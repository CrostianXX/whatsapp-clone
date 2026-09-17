FROM node:22

WORKDIR /app
COPY . .

# Install chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    libxdamage1 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install server dependencies and force rebuild SQLite3 for this exact OS
RUN cd server && npm install
RUN cd server && npm rebuild sqlite3 --build-from-source

# Install client dependencies and build
RUN cd client && npm install && npm run build

EXPOSE 3001

# Run the server
CMD ["npm", "start", "--prefix", "server"]
