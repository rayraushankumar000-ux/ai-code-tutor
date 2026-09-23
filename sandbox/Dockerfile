FROM python:3.13-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc \
       g++ \
       libc6-dev \
       openjdk-17-jdk-headless \
       nodejs \
       npm \
       ca-certificates \
    && npm install --global typescript@5.9.3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.npm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN mkdir -p /work && chmod 1777 /work

WORKDIR /work
USER 65534:65534

CMD ["python", "-I", "-B", "-c", "import time; time.sleep(300)"]