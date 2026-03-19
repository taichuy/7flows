const { exec } = require('child_process');
const https = require('https');

const PORT = 5173;
const WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=3eb9355d-6bbd-4fca-a8bc-da9823d9096d';

function findAndKillProcess(port) {
    return new Promise((resolve, reject) => {
        exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                console.log(`没有找到占用端口 ${port} 的进程`);
                resolve(null);
                return;
            }

            const lines = stdout.trim().split('\n');
            const pids = new Set();
            
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && !isNaN(pid)) {
                    pids.add(pid);
                }
            });

            if (pids.size === 0) {
                console.log(`没有找到占用端口 ${port} 的进程`);
                resolve(null);
                return;
            }

            console.log(`找到占用端口 ${port} 的进程 PID: ${Array.from(pids).join(', ')}`);
            
            let killedPids = [];
            let pending = pids.size;
            
            pids.forEach(pid => {
                exec(`taskkill /F /PID ${pid}`, (err, out, errOut) => {
                    if (!err) {
                        console.log(`已杀死进程 PID: ${pid}`);
                        killedPids.push(pid);
                    } else {
                        console.log(`杀死进程 PID: ${pid} 失败: ${err.message}`);
                    }
                    pending--;
                    if (pending === 0) {
                        resolve(killedPids.length > 0 ? killedPids : null);
                    }
                });
            });
        });
    });
}

function sendWeChatMessage(killedPids) {
    return new Promise((resolve, reject) => {
        const content = killedPids 
            ? `已杀死占用端口 ${PORT} 的进程 (PID: ${killedPids.join(', ')})，等待人工神话`
            : `端口 ${PORT} 无进程占用，等待人工审核`;

        const data = JSON.stringify({
            msgtype: 'text',
            text: {
                content: content,
                mentioned_list: ['wangqing', '@all'],
                mentioned_mobile_list: ['13800001111', '@all']
            }
        });

        const url = new URL(WEBHOOK_URL);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('企业微信消息发送结果:', body);
                resolve(body);
            });
        });

        req.on('error', (e) => {
            console.error('发送企业微信消息失败:', e.message);
            reject(e);
        });

        req.write(data);
        req.end();
    });
}

async function main() {
    console.log(`开始检查端口 ${PORT}...`);
    
    try {
        const killedPids = await findAndKillProcess(PORT);
        console.log('正在发送企业微信消息...');
        await sendWeChatMessage(killedPids);
        console.log('完成！');
    } catch (error) {
        console.error('执行出错:', error);
    }
}

main();
