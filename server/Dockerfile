FROM node:22.22.0-bookworm-slim AS node
FROM python:3.12.14-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl libgl1 libegl1 libgles2 libglib2.0-0 libportaudio2 \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production FACE_VISION_ENABLED=true FACE_PYTHON=/opt/vision/bin/python \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MPLCONFIGDIR=/tmp/threshold-matplotlib \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev && npx prisma generate
COPY vision/requirements.txt ./vision/requirements.txt
RUN python -m venv /opt/vision \
 && /opt/vision/bin/pip install --no-cache-dir --only-binary=:all: -r vision/requirements.txt
COPY vision ./vision
RUN /opt/vision/bin/python vision/download_models.py \
 && /opt/vision/bin/python -c "import sys; sys.path.insert(0,'vision'); from worker import Vision; Vision(); print('Face models initialized')"
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
# No database connection or private key is used at image build time.
RUN useradd --create-home --uid 10001 threshold && chown -R threshold:threshold /app /tmp/threshold-matplotlib
USER threshold
EXPOSE 4100
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
