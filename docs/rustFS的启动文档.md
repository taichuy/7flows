---
title: "Docker 安装 RustFS"
description: "使用 Docker 或 Docker Compose 安装部署 RustFS。"
---

# Docker 安装 RustFS

RustFS 是一款高性能、100% 兼容 S3 的开源分布式对象存储系统。单节点单盘（SNSD）部署模式下，后端采用零纠删校验，不提供额外的数据冗余，适合本地测试与小规模场景。
本文以 RustFS 官方 Linux 二进制包为基础，通过自定义 Dockerfile ，将 RustFS 及其运行时环境打包进容器，并配置数据卷与环境变量，即可一键启动服务。

---

## 一、前置准备

1. **主机要求**

 * 已安装 Docker（≥ 20.10）并能正常拉取镜像与运行容器
 * 本地路径 `/mnt/rustfs/data`（或自定义路径）用于挂载对象数据
2. **网络与防火墙**

 * 确保宿主机 9000 端口对外开放（或自定义端口一致）
3. **配置文件准备**

 * 在宿主机 `/etc/rustfs/config.toml` 中，定义监听端口、管理员账号、数据路径等（详见第四节）

---

## 二、快速拉取 RustFS 官方镜像

使用官方 Ubuntu 基础镜像，快速拉取 RustFS 官方镜像：


```bash
docker pull rustfs/rustfs

```

---


## 三、运行 RustFS 容器

RustFS SNSD Docker 运行方式，结合上述镜像与配置，执行：

```bash
 docker run -d \
  --name rustfs_local \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /mnt/rustfs/data:/data \
  rustfs/rustfs:latest \
  /data
```

各参数说明：

* `-p 9000:9000`：映射宿主机 9000 Endpoint端口到容器
* `-p 9001:9001`：映射宿主机 9001 Console端口到容器
* `-v /mnt/rustfs/data:/data`：挂载数据卷
* `--name rustfs_local`：容器自定义名称
* `-d`：后台运行

---

### 完整参数配置示例

```bash
docker run -d \
  --name rustfs_container \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /mnt/rustfs/data:/data \
  -e RUSTFS_ACCESS_KEY=rustfsadmin \
  -e RUSTFS_SECRET_KEY=rustfsadmin \
  -e RUSTFS_CONSOLE_ENABLE=true \
  -e RUSTFS_SERVER_DOMAINS=example.com \
  rustfs/rustfs:latest \
  --address :9000 \
  --console-enable \
  --server-domains example.com \
  --access-key rustfsadmin \
  --secret-key rustfsadmin \
  /data
```

### 参数说明与对应方法

1. **环境变量方式** (推荐):
   ```bash
   -e RUSTFS_ADDRESS=:9000 \
   -e RUSTFS_SERVER_DOMAINS=example.com \
   -e RUSTFS_ACCESS_KEY=rustfsadmin \
   -e RUSTFS_SECRET_KEY=rustfsadmin \
   -e RUSTFS_CONSOLE_ENABLE=true \
   ```

2. **命令行参数方式**:
   ```
   --address :9000 \
   --server-domains example.com \
   --access-key rustfsadmin \
   --secret-key rustfsadmin \
   --console-enable \
   ```

3. **必需参数**:
    - `<VOLUMES>`: 在命令最后指定，如 `/data`

### 常用配置组合

1. **基础配置**:
   ```bash
   docker run -d \
     -p 9000:9000 \
     -p 9001:9001 \
     -v /mnt/data:/data \
     rustfs/rustfs:latest \
     /data
   ```

2. **启用控制台**:
   ```bash
   docker run -d \
     -p 9000:9000 \
     -p 9001:9001 \
     -v /mnt/data:/data \
     -e RUSTFS_CONSOLE_ENABLE=true \
     rustfs/rustfs:latest \
     --console-enable \
     /data
   ```

3. **自定义认证密钥**:
   ```bash
   docker run -d \
     -p 9000:9000 \
     -p 9001:9001 \
     -v /mnt/data:/data \
     -e RUSTFS_ACCESS_KEY=rustfsadmin \
     -e RUSTFS_SECRET_KEY=rustfsadmin \
     rustfs/rustfs:latest \
     --access-key rustfsadmin \
     --secret-key rustfsadmin \
     /data
   ```

### 注意事项

1. 端口映射要对应：
    - 服务端口默认 9000 (`-p 9000:9000`)

2. 数据卷要持久化：
    - `-v /host/path:/container/path`

3. 环境变量和命令行参数可以混合使用，但命令行参数优先级更高

4. 如果[使用 TLS](../../integration/tls-configured.md)，需要额外挂载证书路径：

   ```bash
   -v /path/to/certs:/certs \
   -e RUSTFS_TLS_PATH=/certs \
   ```

### Docker Compose 安装

RustFS 官方提供了 Docker Compose 的安装方式，[`docker-compose.yml`](https://github.com/rustfs/rustfs/blob/main/docker-compose.yml)文件中包含多个服务，包括 `grafana`、`prometheus`、`otel-collector`、`jaeger` 等，主要围绕可观测性。如果你想同时部署这些服务，克隆 [RustFS 代码仓库](https://github.com/rustfs/rustfs)到本地：

```
git clone git@github.com:rustfs/rustfs.git
```

然后在根目录下执行：

```
docker compose --profile observability up -d
```

会启动如下容器：

```
CONTAINER ID   IMAGE                                             COMMAND                  CREATED         STATUS                            PORTS                                                                                                                                     NAMES
c13c23fe3d9d   rustfs/rustfs:latest                              "/entrypoint.sh rust…"   6 seconds ago   Up 5 seconds (health: starting)   0.0.0.0:9000-9001->9000-9001/tcp, :::9000-9001->9000-9001/tcp                                                                             rustfs-server
e3f4fc4a83a2   grafana/grafana:latest                            "/run.sh"                7 seconds ago   Up 5 seconds                      0.0.0.0:3000->3000/tcp, :::3000->3000/tcp                                                                                                 grafana
71ef1b8212cf   prom/prometheus:latest                            "/bin/prometheus --c…"   7 seconds ago   Up 5 seconds                      0.0.0.0:9090->9090/tcp, :::9090->9090/tcp                                                                                                 prometheus
e7db806b2d6f   jaegertracing/all-in-one:latest                   "/go/bin/all-in-one-…"   7 seconds ago   Up 5 seconds                      4317-4318/tcp, 9411/tcp, 0.0.0.0:14250->14250/tcp, :::14250->14250/tcp, 14268/tcp, 0.0.0.0:16686->16686/tcp, :::16686->16686/tcp          jaeger
1897830a2f1e   otel/opentelemetry-collector-contrib:latest       "/otelcol-contrib --…"   7 seconds ago   Up 5 seconds                      0.0.0.0:4317-4318->4317-4318/tcp, :::4317-4318->4317-4318/tcp, 0.0.0.0:8888-8889->8888-8889/tcp, :::8888-8889->8888-8889/tcp, 55679/tcp   otel-collector
```

如果你仅仅想安装 rustfs，不想启动其他服务，那么你需要在 `docker-compose.yml` 中注释掉：

```
#depends_on:
#  - otel-collector
```

然后执行命令：

```
docker compose -f docker-compose.yml up -d rustfs
```

只启动了 `rustfs-server` 这一个服务：

```
docker ps
CONTAINER ID   IMAGE                                             COMMAND                  CREATED         STATUS                           PORTS                                                           NAMES
e07121ecdd39   rustfs/rustfs:latest                              "/entrypoint.sh rust…"   2 seconds ago   Up 1 second (health: starting)   0.0.0.0:9000-9001->9000-9001/tcp, :::9000-9001->9000-9001/tcp   rustfs-server
```

不管是单独启动 `rustfs-server` 还是和可观测性的服务一起启动，对于 RustFS 实例的访问都是通过 `http://localhost:9000`，并使用默认用户名和密码（均为 `rustfsadmin`）。

### 部署示例

本节提供一个基于宝塔面板环境的生产级部署示例，采用 **双端口 + 双域名** 方案，通过 Nginx 反向代理实现 S3 API 和控制台的分离访问，并配置 SSL 证书实现 HTTPS 加密通信。

#### 场景说明

- **部署环境**：宝塔面板 + Docker Compose
- **架构方案**：单独部署 RustFS（不包含可观测性服务）
- **访问方式**：
  - S3 API 端：`https://s3.example.com` (端口 9000)
  - 控制台端：`https://console.example.com` (端口 9001)
- **特性**：支持 HTTPS、CORS、健康检查

#### Docker Compose 配置

创建 `docker-compose.yml` 文件：

```yaml
version: "3.8"

services:
  rustfs:
    image: rustfs/rustfs:latest
    container_name: rustfs-server
    security_opt:
      - "no-new-privileges:true"
    ports:
      - "9000:9000"   # S3 API 对外端口
      - "9001:9001"   # 控制台对外端口
    environment:
      # 数据卷（多个路径用逗号分隔）
      - RUSTFS_VOLUMES=/data/rustfs0
      # API 和控制台监听地址
      - RUSTFS_ADDRESS=0.0.0.0:9000
      - RUSTFS_CONSOLE_ADDRESS=0.0.0.0:9001
      - RUSTFS_CONSOLE_ENABLE=true
      # CORS 设置，控制台与 S3 API 都放开来源
      - RUSTFS_CORS_ALLOWED_ORIGINS=*
      - RUSTFS_CONSOLE_CORS_ALLOWED_ORIGINS=*
      # 访问密钥（生产环境请修改为强密码）
      - RUSTFS_ACCESS_KEY=rustfsadmin
      - RUSTFS_SECRET_KEY=rustfsadmin
      # 日志级别
      - RUSTFS_OBS_LOGGER_LEVEL=info

    volumes:
      # 存储数据卷（请根据实际情况修改路径）
      - ./deploy/data/pro:/data
      # 日志目录
      - ./deploy/logs:/app/logs

    networks:
      - rustfs-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "sh", "-c", "curl -f http://localhost:9000/health && curl -f http://localhost:9001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  rustfs-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

启动服务：

```bash
docker compose up -d
```

#### Nginx 反向代理配置

##### S3 API 端配置

为 S3 API 创建 Nginx 配置文件（如 `/www/server/panel/vhost/nginx/s3.example.com.conf`）：

```nginx
# S3 API 负载均衡配置
upstream rustfs {
    least_conn;
    server 127.0.0.1:9000;  # S3 API 服务端口
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name s3.example.com;  # 替换为你的 S3 API 域名

    return 301 https://$host$request_uri;
}

# HTTPS 主配置
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name s3.example.com;  # 替换为你的 S3 API 域名

    # SSL 证书配置（请替换为实际证书路径）
    ssl_certificate     /www/server/panel/vhost/cert/s3.example.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/s3.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000";

    # 反向代理 RustFS S3 API
    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port  $server_port;
        proxy_set_header X-Forwarded-Host  $host;

        # 关键配置：禁用 HEAD 请求转换，避免 S3 V4 签名失效
        proxy_cache_convert_head off;
        proxy_connect_timeout 300;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_pass http://rustfs;  # 代理到 S3 API
    }

    # 日志配置（请根据实际情况修改路径）
    access_log  /www/wwwlogs/s3.example.com.log;
    error_log   /www/wwwlogs/s3.example.com.error.log;
}
```

##### 控制台端配置

为控制台创建 Nginx 配置文件（如 `/www/server/panel/vhost/nginx/console.example.com.conf`）：

```nginx
# 控制台负载均衡配置
upstream rustfs-console {
    least_conn;
    server 127.0.0.1:9001;  # 控制台服务端口
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name console.example.com;  # 替换为你的控制台域名

    return 301 https://$host$request_uri;
}

# HTTPS 主配置
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name console.example.com;  # 替换为你的控制台域名

    # SSL 证书配置（请替换为实际证书路径）
    ssl_certificate     /www/server/panel/vhost/cert/console.example.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/console.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000";

    # 反向代理 RustFS 控制台
    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port  $server_port;
        proxy_set_header X-Forwarded-Host  $host;

        # 禁用 HEAD 请求转换
        proxy_cache_convert_head off;
        proxy_connect_timeout 300;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_pass http://rustfs-console;  # 代理到控制台
    }

    # 日志配置（请根据实际情况修改路径）
    access_log  /www/wwwlogs/console.example.com.log;
    error_log   /www/wwwlogs/console.example.com.error.log;
}
```

重载 Nginx 配置：

```bash
nginx -t && nginx -s reload
```

#### 重要说明

> [!WARNING]
> **关键配置项**
> 
> 在 Nginx 配置中**必须添加** `proxy_cache_convert_head off` 指令，原因如下：
> 
> - Nginx 默认会将 HEAD 请求转换为 GET 请求以便缓存
> - 这种转换会导致 S3 V4 签名验证失败
> - 症状表现为访问存储桶时报错 `Bucket not found` 或 `403 AccessDenied`
> 
> 参考 [Nginx 官方文档](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache_convert_head)。

#### 访问验证

配置完成后，通过以下方式验证部署：

1. **访问控制台**：
   ```
   https://console.example.com
   ```
   使用账号密码登录（默认均为 `rustfsadmin`）

2. **测试 S3 API**：
   ```bash
   # 使用 mc 客户端
   mc alias set myrustfs https://s3.example.com rustfsadmin rustfsadmin
   mc mb myrustfs/test-bucket
   mc ls myrustfs
   ```

3. **检查服务状态**：
   ```bash
   # 查看容器状态
   docker ps
   
   # 查看服务日志
   docker logs rustfs-server
   
   # 检查健康状态
   curl http://localhost:9000/health
   curl http://localhost:9001/health
   ```

#### 安全建议

1. **修改默认密钥**：生产环境务必修改 `RUSTFS_ACCESS_KEY` 和 `RUSTFS_SECRET_KEY` 为强密码
2. **限制 CORS**：将 `RUSTFS_CORS_ALLOWED_ORIGINS` 从 `*` 改为具体域名
3. **防火墙配置**：确保 9000 和 9001 端口仅允许 Nginx 服务器访问
4. **SSL 证书**：建议使用 Let's Encrypt 自动续期证书
5. **定期备份**：配置数据卷的定期备份策略

## 四、验证与访问

1. **查看容器状态与日志：**

 ```bash
 docker logs rustfs_local
 ```

 日志应显示服务启动成功，并监听 9000 端口。

2. **测试 S3 API：**

 使用 `mc` 或其他 S3 客户端：

 ```bash
 mc alias set rustfs http://localhost:9000 rustfsadmin ChangeMe123!
 mc mb rustfs/mybucket
 mc ls rustfs
 ```

 如能成功创建并列举 bucket，则部署生效。


## 五、其他建议

1. 生产环境建议：
- 使用多节点部署架构
- [启用 TLS 加密通信](../../integration/tls-configured.md)
- 配置日志轮转策略
- 设置定期备份策略

2. 存储建议：
- 使用本地 SSD/NVMe 存储
- 避免使用网络文件系统 (NFS)
- 保证存储目录独占访问

---

## 小结

本文结合 RustFS 单节点单盘容器化最佳实践，详细演示了如何通过 Docker 自行构建 RustFS 镜像并部署 SNSD 环境。
该方案易于快速启动与试验，后续可在 Kubernetes、Swarm 等平台上采用同样思路扩展为多节点多盘生产级集群。