> ## Documentation Index
> Fetch the complete documentation index at: https://docs.dify.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用源代码本地启动

<Note> ⚠️ 本文档由 AI 自动翻译。如有任何不准确之处，请参考[英文原版](/en/self-host/advanced-deployments/local-source-code)。</Note>

## 前提条件

### 设置 Docker 和 Docker Compose

> 在安装 Dify 之前，请确保你的设备符合以下最低系统要求：
>
> * CPU >= 2 核
> * RAM >= 4 GiB

| 操作系统               | 软件                                             | 说明                                                                                                                                                                                |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS 10.14 或更高版本  | Docker Desktop                                 | 将 Docker 虚拟机(VM)设置为至少使用 2 个虚拟 CPU(vCPU)和 8 GB 的初始内存。否则，安装可能会失败。更多信息，请参考 [Docker Desktop for Mac 安装指南](https://docs.docker.com/desktop/mac/install/)。                              |
| Linux 平台           | Docker 19.03 或更高版本 Docker Compose 1.25.1 或更高版本 | 请参考 [Docker 安装指南](https://docs.docker.com/engine/install/) 和 [Docker Compose 安装指南](https://docs.docker.com/compose/install/) 了解如何分别安装 Docker 和 Docker Compose。                    |
| 启用 WSL 2 的 Windows | Docker Desktop                                 | 我们建议将源代码和绑定到 Linux 容器的其他数据存储在 Linux 文件系统中，而不是 Windows 文件系统中。更多信息，请参考 [Windows 上使用 WSL 2 后端的 Docker Desktop 安装指南](https://docs.docker.com/desktop/windows/install/#wsl-2-backend)。 |

> 如果需要使用 OpenAI TTS，系统必须安装 `FFmpeg` 才能正常运行。更多详情，请参考：[链接](https://docs.dify.ai/getting-started/install-self-hosted/install-faq#id-14.-what-to-do-if-this-error-occurs-in-text-to-speech)。

### 克隆 Dify 仓库

运行 git 命令克隆 [Dify 仓库](https://github.com/langgenius/dify)。

```Bash  theme={null}
git clone https://github.com/langgenius/dify.git
```

### 使用 Docker Compose 启动中间件

Dify 后端服务需要一系列用于存储（如 PostgreSQL / Redis / Weaviate（如果本地不可用））和扩展能力（如 Dify 的 [sandbox](https://github.com/langgenius/dify-sandbox) 和 [plugin-daemon](https://github.com/langgenius/dify-plugin-daemon) 服务）的中间件。通过运行以下命令使用 Docker Compose 启动中间件：

```Bash  theme={null}
cd docker

cp middleware.env.example middleware.env

# 如果不使用 postgresql，请将 profile 更改为 mysql
# 如果不使用 weaviate，请将 profile 更改为其他向量数据库
docker compose -f docker-compose.middleware.yaml --profile postgresql --profile weaviate -p dify up -d
```

***

## 设置后端服务

后端服务包括：

1. API 服务：为前端服务和 API 访问提供 API 请求服务
2. Worker 服务：为数据集处理、工作区、清理等异步任务提供服务

### 启动 API 服务

1. 导航到 `api` 目录：

   ```
   cd api
   ```

2. 准备环境变量配置文件：

   ```
   cp .env.example .env
   ```

   <Note>
     当前端和后端运行在不同子域名时，需要在 `.env` 文件中将 `COOKIE_DOMAIN` 设置为站点的顶级域名（例如 `example.com`）。

     前端和后端必须位于同一顶级域名下才能共享身份验证 cookie。
   </Note>

3. 生成随机密钥并替换 `.env` 文件中的 SECRET\_KEY 值：

   ```
   awk -v key="$(openssl rand -base64 42)" '/^SECRET_KEY=/ {sub(/=.*/, "=" key)} 1' .env > temp_env && mv temp_env .env
   ```

4. 安装依赖：

   使用 [uv](https://docs.astral.sh/uv/getting-started/installation/) 管理依赖。
   通过运行以下命令使用 `uv` 安装所需依赖：

   ```
   uv sync --dev
   ```

   > 对于 macOS：使用 `brew install libmagic` 安装 libmagic。

5. 执行数据库迁移：

   执行数据库迁移到最新版本：

   ```
   uv run flask db upgrade
   ```

6. 启动 API 服务：

   ```
   uv run flask run --host 0.0.0.0 --port=5001 --debug
   ```

   预期输出：

   ```
   * Debug mode: on
   INFO:werkzeug:WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
    * Running on all addresses (0.0.0.0)
    * Running on http://127.0.0.1:5001
   INFO:werkzeug:Press CTRL+C to quit
   INFO:werkzeug: * Restarting with stat
   WARNING:werkzeug: * Debugger is active!
   INFO:werkzeug: * Debugger PIN: 695-801-919
   ```

### 启动 Worker 服务

要从队列中消费异步任务，例如数据集文件导入和数据集文档更新，请按照以下步骤启动 Worker 服务：

* 对于 macOS 或 Linux

  ```
  uv run celery -A app.celery worker -P gevent -c 1 --loglevel INFO -Q dataset,dataset_summary,priority_dataset,priority_pipeline,pipeline,mail,ops_trace,app_deletion,plugin,workflow_storage,conversation,workflow,schedule_poller,schedule_executor,triggered_workflow_dispatcher,trigger_refresh_executor,retention,workflow_based_app_execution
  ```

  如果你使用 Windows 系统启动 Worker 服务，请使用以下命令：

* 对于 Windows

  ```
  uv run celery -A app.celery worker -P solo --without-gossip --without-mingle --loglevel INFO -Q dataset,dataset_summary,priority_dataset,priority_pipeline,pipeline,mail,ops_trace,app_deletion,plugin,workflow_storage,conversation,workflow,schedule_poller,schedule_executor,triggered_workflow_dispatcher,trigger_refresh_executor,retention,workflow_based_app_execution
  ```

  预期输出：

  ```
  -------------- celery@bwdeMacBook-Pro-2.local v5.4.0 (opalescent)
  --- ***** -----
  -- ******* ---- macOS-15.4.1-arm64-arm-64bit 2025-04-28 17:07:14
  - *** --- * ---
  - ** ---------- [config]
  - ** ---------- .> app:         app_factory:0x1439e8590
  - ** ---------- .> transport:   redis://:**@localhost:6379/1
  - ** ---------- .> results:     postgresql://postgres:**@localhost:5432/dify
  - *** --- * --- .> concurrency: 1 (gevent)
    -- ******* ---- .> task events: OFF (enable -E to monitor tasks in this worker)
    --- ***** -----
    -------------- [queues]
    .> dataset          exchange=dataset(direct) key=dataset
    .> generation       exchange=generation(direct) key=generation
    .> mail             exchange=mail(direct) key=mail
    .> ops_trace        exchange=ops_trace(direct) key=ops_trace

  [tasks]
  . schedule.clean_embedding_cache_task.clean_embedding_cache_task
  . schedule.clean_messages.clean_messages
  . schedule.clean_unused_datasets_task.clean_unused_datasets_task
  . schedule.create_tidb_serverless_task.create_tidb_serverless_task
  . schedule.mail_clean_document_notify_task.mail_clean_document_notify_task
  . schedule.update_tidb_serverless_status_task.update_tidb_serverless_status_task
  . tasks.add_document_to_index_task.add_document_to_index_task
  . tasks.annotation.add_annotation_to_index_task.add_annotation_to_index_task
  . tasks.annotation.batch_import_annotations_task.batch_import_annotations_task
  . tasks.annotation.delete_annotation_index_task.delete_annotation_index_task
  . tasks.annotation.disable_annotation_reply_task.disable_annotation_reply_task
  . tasks.annotation.enable_annotation_reply_task.enable_annotation_reply_task
  . tasks.annotation.update_annotation_to_index_task.update_annotation_to_index_task
  . tasks.batch_clean_document_task.batch_clean_document_task
  . tasks.batch_create_segment_to_index_task.batch_create_segment_to_index_task
  . tasks.clean_dataset_task.clean_dataset_task
  . tasks.clean_document_task.clean_document_task
  . tasks.clean_notion_document_task.clean_notion_document_task
  . tasks.deal_dataset_vector_index_task.deal_dataset_vector_index_task
  . tasks.delete_account_task.delete_account_task
  . tasks.delete_segment_from_index_task.delete_segment_from_index_task
  . tasks.disable_segment_from_index_task.disable_segment_from_index_task
  . tasks.disable_segments_from_index_task.disable_segments_from_index_task
  . tasks.document_indexing_sync_task.document_indexing_sync_task
  . tasks.document_indexing_task.document_indexing_task
  . tasks.document_indexing_update_task.document_indexing_update_task
  . tasks.duplicate_document_indexing_task.duplicate_document_indexing_task
  . tasks.enable_segments_to_index_task.enable_segments_to_index_task
  . tasks.mail_account_deletion_task.send_account_deletion_verification_code
  . tasks.mail_account_deletion_task.send_deletion_success_task
  . tasks.mail_email_code_login.send_email_code_login_mail_task
  . tasks.mail_invite_member_task.send_invite_member_mail_task
  . tasks.mail_reset_password_task.send_reset_password_mail_task
  . tasks.ops_trace_task.process_trace_tasks
  . tasks.recover_document_indexing_task.recover_document_indexing_task
  . tasks.remove_app_and_related_data_task.remove_app_and_related_data_task
  . tasks.remove_document_from_index_task.remove_document_from_index_task
  . tasks.retry_document_indexing_task.retry_document_indexing_task
  . tasks.sync_website_document_indexing_task.sync_website_document_indexing_task

  2025-04-28 17:07:14,681 INFO [connection.py:22]  Connected to redis://:**@localhost:6379/1
  2025-04-28 17:07:14,684 INFO [mingle.py:40]  mingle: searching for neighbors
  2025-04-28 17:07:15,704 INFO [mingle.py:49]  mingle: all alone
  2025-04-28 17:07:15,733 INFO [worker.py:175]  celery@bwdeMacBook-Pro-2.local ready.
  2025-04-28 17:07:15,742 INFO [pidbox.py:111]  pidbox: Connected to redis://:**@localhost:6379/1.
  ```

### 启动 Beat 服务

如需调试 celery 定时任务或运行定时触发器节点，可以在另一个终端中运行以下命令启动 beat 服务：

```bash  theme={null}
uv run celery -A app.celery beat
```

***

## 设置 Web 服务

启动用于前端页面的 web 服务。

### 环境准备

要启动 web 前端服务，需要 [Node.js v22 (LTS)](http://nodejs.org/) 和 [PNPM v10](https://pnpm.io/)。

* 安装 NodeJS

  请访问 [https://nodejs.org/en/download](https://nodejs.org/en/download) 并选择适合你操作系统的 v18.x 或更高版本的安装包。推荐使用 LTS 版本进行常规使用。

* 安装 PNPM

  按照 [安装指南](https://pnpm.io/installation) 安装 PNPM。或者直接使用 `npm` 运行以下命令安装 `pnpm`。

  ```
  npm i -g pnpm
  ```

### 启动 Web 服务

1. 进入 web 目录：

   ```
   cd web
   ```

2. 安装依赖：

   ```
   pnpm install --frozen-lockfile
   ```

3. 准备环境变量配置文件\
   在当前目录中创建一个名为 `.env.local` 的文件，并从 `.env.example` 复制内容。根据你的需求修改这些环境变量的值：

   ```
   # For production release, change this to PRODUCTION
   NEXT_PUBLIC_DEPLOY_ENV=DEVELOPMENT

   # The deployment edition, SELF_HOSTED or CLOUD
   NEXT_PUBLIC_EDITION=SELF_HOSTED

   # The base URL of console application, refers to the Console base URL of WEB service if console domain is different from api or web app domain.
   # example: http://cloud.dify.ai/console/api
   NEXT_PUBLIC_API_PREFIX=http://localhost:5001/console/api

   # The URL for Web APP, refers to the Web App base URL of WEB service if web app domain is different from console or api domain.
   # example: http://udify.app/api
   NEXT_PUBLIC_PUBLIC_API_PREFIX=http://localhost:5001/api

   # When the frontend and backend run on different subdomains, set NEXT_PUBLIC_COOKIE_DOMAIN=1.
   NEXT_PUBLIC_COOKIE_DOMAIN=

   # SENTRY
   NEXT_PUBLIC_SENTRY_DSN=
   NEXT_PUBLIC_SENTRY_ORG=
   NEXT_PUBLIC_SENTRY_PROJECT=
   ```

4. 构建 web 服务：

   ```
   pnpm build
   ```

5. 启动 web 服务：

   ```
   pnpm start
   ```

   预期输出：

   ```
      ▲ Next.js 15
      - Local:        http://localhost:3000
      - Network:      http://0.0.0.0:3000

    ✓ Starting...
    ✓ Ready in 73ms
   ```

### 访问 Dify

通过浏览器访问 [http://127.0.0.1:3000](http://127.0.0.1:3000/) 即可享受 Dify 所有激动人心的功能。
干杯！🍻
