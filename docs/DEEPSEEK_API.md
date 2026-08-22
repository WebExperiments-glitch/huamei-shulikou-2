# DeepSeek API 快速开始与省钱指南

> 面向「术力口 AI 智能体」项目：让 AI 调用更智能、更贴合 DeepSeek 的**上下文硬盘缓存命中逻辑**、更省钱。
>
> 本文所有数据（模型名、上下文长度、价格、缓存计费等）均抓取自 DeepSeek 官方文档（中文站 `https://api-docs.deepseek.com/zh-cn/`），以官方文档为准，未做任何编造。部分页面若未能抓取到会明确标注"(未能抓取)"。

---

## 0. 关键速览（先看这里）

| 项目 | 值 |
|---|---|
| OpenAI 兼容 base_url | `https://api.deepseek.com` |
| Anthropic 兼容 base_url | `https://api.deepseek.com/anthropic` |
| Beta 功能 base_url | `https://api.deepseek.com/beta` |
| API Key | [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| 主模型 | `deepseek-v4-flash`（便宜、快、并发高） |
| 主力模型 | `deepseek-v4-pro`（更强、更贵、并发低） |
| 上下文长度 | 两者均为 **1M（百万）** |
| 输出长度 | 最大 **384K** |
| 缓存 | **默认开启**，无需改代码，前缀命中即省钱 |
| 旧模型名 | `deepseek-chat` / `deepseek-reasoner` 已于 **2026/07/24 23:59 弃用**，分别对应 `deepseek-v4-flash` 的非思考 / 思考模式 |

**省钱三句话**：① 固定且稳定的 prompt 前缀（system + 大段资料）放在 messages 最前面 → 命中缓存；② 长文本、系统提示不要改动前缀顺序，保持稳定；③ 日常任务用 `deepseek-v4-flash`，复杂任务才用 `deepseek-v4-pro`。

---

## 1. 首次调用 API（快速开始）

DeepSeek API 使用与 OpenAI / Anthropic 兼容的格式，改 `base_url` 和 `api_key` 即可用现成 SDK 调用。

```bash
# 创建 API key：https://platform.deepseek.com/api_keys
```

### 1.1 curl 示例

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-v4-pro",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "thinking": {"type": "enabled"},
    "reasoning_effort": "high",
    "stream": false
  }'
```

### 1.2 Python 示例（OpenAI SDK）

```bash
pip3 install openai
```

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get('DEEPSEEK_API_KEY'),
    base_url="https://api.deepseek.com",
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
    ],
    stream=False,
)

print(response.choices[0].message.content)
```

> 说明：`thinking`（思考开关）与 `user_id` 等扩展参数在使用 OpenAI SDK 时需要放到 `extra_body` 里（见第 7 章）。

---

## 2. 模型与价格

> 价格以「百万 tokens」为单位。Token 是模型表示自然语言文本的最小单位。计费 = token 消耗量 × 模型单价。

| 模型 | deepseek-v4-flash | deepseek-v4-pro |
|---|---|---|
| 上下文长度 | 1M | 1M |
| 输出长度上限 | 384K | 384K |
| 思考模式 | 支持（默认开启） | 支持（默认开启） |
| **输入单价 · 缓存命中** | **0.02 元 / 百万 tokens** | **0.025 元 / 百万 tokens** |
| **输入单价 · 缓存未命中** | **1 元 / 百万 tokens** | **3 元 / 百万 tokens** |
| **输出单价** | **2 元 / 百万 tokens** | **6 元 / 百万 tokens** |
| 并发限制 | 2500 | 500 |
| JSON Output | 支持 | 支持 |
| Tool Calls | 支持 | 支持 |
| 对话前缀续写（Beta） | 支持 | 支持 |
| FIM 补全（Beta） | 仅非思考模式 | 仅非思考模式 |

**关键结论（省钱）**：
- 缓存命中 vs 未命中价格差达 **50 倍**（flash：0.02 vs 1 元；pro：0.025 vs 3 元）。**提升缓存命中率是省钱的第一优先级。**
- `deepseek-v4-flash` 输入未命中仅 1 元、输出仅 2 元，适合高频、大批量任务。
- 扣费顺序：同时有充值余额与赠送余额时，**优先扣赠送余额**。

---

## 3. Token 用量计算

### 3.1 换算参考
- 1 个英文字符 ≈ 0.3 个 token
- 1 个中文字符 ≈ 0.6 个 token
- 不同模型分词不同，实际以返回的 `usage` 为准。

### 3.2 `usage` 字段结构（Chat Completions 返回）

```json
{
  "usage": {
    "prompt_tokens": 10000,
    "completion_tokens": 500,
    "prompt_cache_hit_tokens": 8000,
    "prompt_cache_miss_tokens": 2000,
    "total_tokens": 10500,
    "completion_tokens_details": { "reasoning_tokens": 300 }
  }
}
```

| 字段 | 含义 |
|---|---|
| `prompt_tokens` | 输入 token 数，**等于 `prompt_cache_hit_tokens + prompt_cache_miss_tokens`** |
| `prompt_cache_hit_tokens` | 命中上下文缓存的输入 token 数（按「缓存命中」低价计费） |
| `prompt_cache_miss_tokens` | 未命中缓存的输入 token 数（按「缓存未命中」高价计费） |
| `completion_tokens` | 输出 token 数 |
| `completion_tokens_details.reasoning_tokens` | 思考模式下思维链 token 数 |
| `total_tokens` | prompt + completion 总 token 数 |

> 离线计算 token 可下载官方 tokenizer：`https://cdn.deepseek.com/api-docs/deepseek_v3_tokenizer.zip`

---

## 4. 上下文硬盘缓存（核心省钱机制）

### 4.1 概述
DeepSeek API 上下文硬盘缓存技术**对所有用户默认开启，无需修改代码**。每个请求都会触发硬盘缓存构建；若后续请求与之前的请求在**前缀**上存在重复，重复部分只需从缓存拉取，计入「缓存命中」，按极低价格计费。

### 4.2 命中规则（关键）
受 Sliding Window Attention 影响，每条缓存前缀是一个**独立的完整单元**。后续请求只有**完整匹配缓存前缀单元**时才能命中缓存。

缓存前缀落盘时机（三种）：
1. **请求结束位置落盘**：每次请求的「用户输入结束位置」与「模型输出结束位置」各产生一个缓存前缀单元。
2. **公共前缀检测落盘**：系统检测到多次请求存在公共前缀时，将该公共前缀落盘为独立单元。
3. **按固定 token 间隔落盘**：长输入/长输出中按固定 token 间隔截取前缀单元，避免长前缀无法被缓存。

**两个典型例子（务必理解）**：
- **例一（多轮对话）**：第一轮 `A+B`，第二轮 `A+B+C` → 第二轮完整匹配 `A+B` 单元，**命中**。
- **例二（长文本问答）**：第一轮 `A+B`，第二轮 `A+C` → 第二轮**无法命中**（`A+C` 不能完整匹配 `A+B`）。但系统识别出公共前缀 `A` 并落盘，第三轮 `A+D` 可命中 `A`。
  - 例如：前两次请求 `system` + `<财报内容>` 前缀相同但提问不同 → 前两次**不命中**，两次后系统把公共前缀落盘，第三次提问可命中该前缀。

### 4.3 如何提高命中率（实践）
1. **把固定内容放在最前面**：`system` 提示词、常驻资料/知识库内容放在 `messages` 开头且保持顺序不变。
2. **保持前缀稳定**：不要在 system/文档中间插入会变化的字段，否则前缀分裂、无法完整匹配。
3. **短小提问放在尾部**：把每次变化的提问（如某首歌的分析）放在 `messages` 末尾，让前面的大段固定前缀命中缓存。
4. **善用 `user_id`**：`user_id` 用于 KVCache 隔离，同一业务用户用相同 `user_id` 有助于前缀稳定（也用于内容安全与调度隔离，见第 5 章）。

### 4.4 其它说明
- 缓存系统是「尽力而为」，不保证 100% 命中。
- 缓存构建耗时秒级；不再使用后会自动清空（一般几小时到几天）。
- 硬盘缓存只匹配**输入前缀**；**输出仍通过推理计算**，受 `temperature` 等参数影响，效果与不使用缓存相同（不会影响输出质量/随机性）。

### 4.5 查看命中
看返回 `usage.prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`（见第 3 章）。

---

## 5. 限速与隔离

### 5.1 并发限速（按账号，与 API Key 无关）
| | deepseek-v4-pro | deepseek-v4-flash |
|---|---|---|
| 并发限制 | 500 | 2500 |

- 一个请求从发出到模型响应完成计为一个并发。
- 并发以**账号粒度**计，与 API Key 无关。
- 超过并发限制会收到 **HTTP 429**。
- 需要更高并发可提交「账号扩容申请工单」（扩容不额外收费）。

### 5.2 `user_id` 隔离
传入 `user_id` 可对业务侧用户做细粒度管理，作用：
- **内容安全隔离**
- **KVCache 隔离**（隐私管理）
- **调度隔离**：普通用户所有 `user_id` 合并计算并发；提升并发配额的用户按每个 `user_id` 分别限流（pro 500 / flash 2500），超限返回 429。

`user_id` 规则：正则 `[a-zA-Z0-9\-_]+`，最大长度 512，**不要包含用户隐私信息**。

OpenAI SDK 传法（需放 `extra_body`）：
```python
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "Hello!"}],
    extra_body={"user_id": "your_user_id"}
)
```

### 5.3 请求保活机制
请求发出后等待响应期间会保持连接：
- 非流式请求：持续返回**空行**
- 流式请求：持续返回 SSE keep-alive 注释 `: keep-alive`
- 这些内容不影响 JSON body 解析；若 10 分钟仍未开始推理，服务器会关闭连接。

---

## 6. 错误码速查表

| 错误码 | 原因 | 处理建议 |
|---|---|---|
| 400 | 请求体格式错误 | 根据错误信息修改请求体 |
| 401 | API key 错误，认证失败 | 检查 API key；没有则先[创建](https://platform.deepseek.com/api_keys) |
| 402 | 账号余额不足 | 确认余额并前往[充值](https://platform.deepseek.com/top_up) |
| 422 | 请求体参数错误 | 根据错误信息修改相关参数 |
| 429 | 请求速率（TPM/RPM）达到上限 | 合理规划请求速率，做退避重试 |
| 500 | 服务器内部故障 | 等待后重试；持续则联系官方 |
| 503 | 服务器负载过高 | 稍后重试 |

> 另注意：思考模式下工具调用若未正确回传 `reasoning_content`，API 会返回 **400**（见第 7、8 章）。

---

## 7. API 指南要点

### 7.1 思考模式（thinking mode）
模型在输出最终回答前先输出一段思维链，提升准确率。

- 默认思考开关为 **`enabled`**（即默认思考模式）。
- 开关：`{"thinking": {"type": "enabled" / "disabled"}}`（OpenAI 格式，SDK 需放 `extra_body`）。
- 思考强度：`reasoning_effort`: `high` / `max`（默认 `high`；Claude Code、OpenCode 等复杂 Agent 请求自动 `max`；兼容 `low`/`medium`→`high`，`xhigh`→`max`）。Anthropic 格式用 `output_config.effort`。
- 思考模式下 **`temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 不生效**（传了不报错但不生效）。
- 思维链通过 `reasoning_content` 返回，与 `content` 同级。
  - 两个 `user` 之间**未进行工具调用** → 中间 assistant 的 `reasoning_content` 无需回传（传了会被忽略）。
  - 两个 `user` 之间**进行了工具调用** → 中间 assistant 的 `reasoning_content` **必须完整回传**，否则返回 400。

Python 访问思维链：
```python
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}},
)
reasoning_content = response.choices[0].message.reasoning_content
content = response.choices[0].message.content
```

### 7.2 多轮对话
`/chat/completions` 是**无状态** API，服务端不记录上下文，每次请求需**手动拼接全部历史**。规则：
- 第一轮：只传 user 消息。
- 第二轮起：把上一轮模型的输出（assistant 消息）append 到末尾，再 append 新的 user 消息。
- role 交替：`user → assistant → user → assistant …`（工具调用则插入 `tool` 消息）。

```python
from openai import OpenAI
client = OpenAI(api_key="<KEY>", base_url="https://api.deepseek.com")

# Round 1
messages = [{"role": "user", "content": "What's the highest mountain in the world?"}]
response = client.chat.completions.create(model="deepseek-v4-pro", messages=messages)
messages.append(response.choices[0].message)  # assistant 输出

# Round 2
messages.append({"role": "user", "content": "What is the second?"})
response = client.chat.completions.create(model="deepseek-v4-pro", messages=messages)
```

### 7.3 对话前缀续写（Beta）
用 `assistant` 开头消息让模型补全其余内容（如强制输出代码）。
- 条件：`messages` 最后一条 `role` 为 `assistant`，且设置 `prefix=True`；需 `base_url="https://api.deepseek.com/beta"`。

```python
from openai import OpenAI
client = OpenAI(api_key="<KEY>", base_url="https://api.deepseek.com/beta")
messages = [
    {"role": "user", "content": "Please write quick sort code"},
    {"role": "assistant", "content": "```python\n", "prefix": True}
]
response = client.chat.completions.create(
    model="deepseek-v4-pro", messages=messages, stop=["```"],
)
```

### 7.4 FIM 补全（Beta）
Fill-In-the-Middle，提供前缀和后缀（可选），模型补全中间内容，用于内容续写、代码补全。
- 最大补全长度 **4K**；需 `base_url="https://api.deepseek.com/beta"`；**仅非思考模式支持**；端点 `POST /beta/completions`。

```python
from openai import OpenAI
client = OpenAI(api_key="<KEY>", base_url="https://api.deepseek.com/beta")
response = client.completions.create(
    model="deepseek-v4-pro",
    prompt="def fib(a):",
    suffix=" return fib(a-1) + fib(a-2)",
    max_tokens=128,
)
print(response.choices[0].text)
```

### 7.5 JSON Output
保证模型输出合法 JSON。
- 设置 `response_format={'type': 'json_object'}`。
- **prompt 中必须含 `json` 字样**并给出 JSON 样例，否则可能输出空白直到 token 用尽（请求像"卡住"）。
- 合理设置 `max_tokens`，防止 JSON 被截断。
- 官方提示：使用 JSON Output 时 API **有概率返回空 content**，可尝试改 prompt 缓解。

```python
import json
from openai import OpenAI
client = OpenAI(api_key="<KEY>", base_url="https://api.deepseek.com")
system_prompt = '...请输出 JSON，例如 {"question": "...", "answer": "..."}'
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "system", "content": system_prompt},
              {"role": "user", "content": "Which is the longest river in the world?"}],
    response_format={'type': 'json_object'},
)
print(json.loads(response.choices[0].message.content))
```

### 7.6 使用 Responses API
为满足 Codex 等需求，新增对 Responses API 格式的支持，`base_url` 仍是 `https://api.deepseek.com`。

```python
from openai import OpenAI
client = OpenAI(api_key="<KEY>", base_url="https://api.deepseek.com")
response = client.responses.create(
    model="deepseek-v4-flash",
    instructions="You are a helpful assistant.",
    input="Hi, how are you?",
)
print(response.output_text)
```

流式（`stream=True`）：返回语义化 SSE 事件，以 `response.completed` / `response.incomplete` / `response.failed` 结束（**没有** `data: [DONE]`）。常用事件：`response.output_text.delta`、`response.reasoning_text.delta`、`response.function_call_arguments.delta`、`response.completed`（含完整 `usage`）。

Responses API usage 字段：
- `input_tokens`：输入 token，其中 `input_tokens_details.cached_tokens` = 命中缓存的 token 数
- `output_tokens`：输出 token，其中 `output_tokens_details.reasoning_tokens` = 思维链 token 数

兼容性要点：`previous_response_id` / `conversation` / `store` / `metadata` / `include` / `background` 等**不支持**（无状态 API，静默忽略）；`tools` 支持 `function` 与 `web_search`；`custom` 仅支持 `apply_patch`（Codex 兼容）；图片输入会被替换为占位文本；`parallel_tool_calls` 始终开启。

### 7.7 使用 Anthropic API
Anthropic 兼容端点 `base_url="https://api.deepseek.com/anthropic"`。
- 模型映射：`claude-opus*` → `deepseek-v4-pro`；`claude-haiku*` / `claude-sonnet*` → `deepseek-v4-flash`。传入不支持的模型名自动映射到 `deepseek-v4-flash`。
- 常用字段支持：`max_tokens`、`stop_sequences`、`stream`、`system`、`temperature`（0~2）、`top_p`；`thinking.budget_tokens` 忽略；`output_config` 仅 `effort` 支持；`metadata.user_id` 支持（其余忽略）。
- Tool：`name`/`input_schema`/`description` 支持；`cache_control` 忽略；`tool_choice` 支持 none/auto/any/tool（`disable_parallel_tool_use` 忽略）。
- Message：`content` 支持 string 与 `text`、`thinking`、`tool_use`、`tool_result`、`server_tool_use`、`web_search_tool_result`；**不支持** image、document、search_result、redacted_thinking、mcp_tool_use 等。
- HTTP Header：`x-api-key` 完全支持；`anthropic-beta` / `anthropic-version` 忽略。

```python
import anthropic
client = anthropic.Anthropic()  # 需设置 ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY
message = client.messages.create(
    model="deepseek-v4-pro",
    max_tokens=1000,
    system="You are a helpful assistant.",
    messages=[{"role": "user", "content": [{"type": "text", "text": "Hi, how are you?"}]}],
)
```

### 7.8 Tool Calls 写法要点（详见第 8 章）
- 用 `tools` 参数传 function 列表（仅支持 `function` 类型，最多 128 个）。
- 模型返回 `tool_calls`（含 `id`、`function.name`、`function.arguments`）。
- 用户执行函数后，把结果以 `role: "tool"`、`tool_call_id`、`content` 回传给 API。
- 思考模式下有工具调用时，必须完整回传 `reasoning_content`（否则 400）。
- `strict` 模式（Beta）：`base_url=/beta` + 每个 function 设 `strict: true`，强制输出符合 JSON Schema。

---

## 8. Tool Calls 完整示例（可直接用）

### 8.1 非思考模式基础示例
```python
from openai import OpenAI

def send_messages(messages):
    response = client.chat.completions.create(
        model="deepseek-v4-pro",
        messages=messages,
        tools=tools,
    )
    return response.choices[0].message

client = OpenAI(api_key="<KEY>", base_url="https://api.deepseek.com")

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location, the user should supply a location first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    }
                },
                "required": ["location"]
            },
        }
    },
]

messages = [{"role": "user", "content": "How's the weather in Hangzhou, Zhejiang?"}]

message = send_messages(messages)          # 模型返回 function 调用
tool = message.tool_calls[0]
messages.append(message)                    # 追加 assistant 消息（含 tool_calls）
messages.append({                          # 追加 tool 结果
    "role": "tool",
    "tool_call_id": tool.id,
    "content": "24℃",                       # 此处应为你的函数真实执行结果
})
message = send_messages(messages)           # 模型根据工具结果输出最终回答
print(message.content)
```
执行流程：用户提问 → 模型返回 `get_weather({location:'Hangzhou'})` → 你调用真实函数并回传结果 → 模型输出自然语言最终答案。**模型不执行函数本身，函数需你实现。**

### 8.2 思考模式 + 工具调用（含 reasoning_content 回传，重点）
思考模式下可进行多轮"思考→调工具→再思考"，**所有发生工具调用的轮次的 `reasoning_content` 必须在后续所有请求中完整回传**，否则 400。最稳妥写法是直接 `messages.append(response.choices[0].message)`（会自动带上 `content`、`reasoning_content`、`tool_calls`）。

```python
import os, json
from openai import OpenAI
from datetime import datetime

tools = [
    {"type": "function", "function": {
        "name": "get_date",
        "description": "Get the current date",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_weather",
        "description": "Get weather of a location, the user should supply the location and date.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "The city name"},
                "date": {"type": "string", "description": "The date in format YYYY-mm-dd"},
            },
            "required": ["location", "date"]
        },
    }},
]

def get_date_mock(): return datetime.now().strftime("%Y-%m-%d")
def get_weather_mock(location, date): return "Cloudy 7~13°C"

TOOL_CALL_MAP = {"get_date": get_date_mock, "get_weather": get_weather_mock}

client = OpenAI(
    api_key=os.environ.get('DEEPSEEK_API_KEY'),
    base_url=os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
)

def run_turn(messages):
    while True:
        response = client.chat.completions.create(
            model='deepseek-v4-pro',
            messages=messages,
            tools=tools,
            reasoning_effort="high",
            extra_body={"thinking": {"type": "enabled"}},
        )
        messages.append(response.choices[0].message)  # 自动带上 reasoning_content
        tool_calls = response.choices[0].message.tool_calls
        if tool_calls is None:
            break  # 无工具调用 → 已是最终答案
        for tool in tool_calls:
            result = TOOL_CALL_MAP[tool.function.name](**json.loads(tool.function.arguments))
            messages.append({
                "role": "tool",
                "tool_call_id": tool.id,
                "content": result,
            })

messages = [{"role": "user", "content": "How's the weather in Hangzhou tomorrow?"}]
run_turn(messages)

messages.append({"role": "user", "content": "How's the weather in Guangzhou tomorrow?"})
run_turn(messages)  # 携带前一轮的 reasoning_content
```

### 8.3 `strict` 模式（Beta）
- 需 `base_url="https://api.deepseek.com/beta"`；
- 所有 function 设 `"strict": true`；
- 支持 JSON Schema 类型：object / string / number / integer / boolean / array / enum / anyOf；支持 `$ref` / `$def`。
- 规则：每个 `object` 的属性必须全部设为 `required`，且 `additionalProperties` 必须为 `false`；string 支持 `pattern` / `format`（email、hostname、ipv4、ipv6、uuid），不支持 minLength/maxLength；number 支持 minimum/maximum/exclusiveMinimum/exclusiveMaximum/multipleOf/const/default；array 不支持 minItems/maxItems。

---

## 9. Agent 工具接入（base_url / API Key 配置表）

> 均为官方文档给出，可把 DeepSeek 作为后端模型，无需写代码。部分工具为第三方提供，官方不保证有效性/安全性。

| 工具 | 接入方式 / base_url | 模型 |
|---|---|---|
| **Claude Code** | 环境变量 `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`，`ANTHROPIC_AUTH_TOKEN=<KEY>`，`ANTHROPIC_MODEL=deepseek-v4-pro[1m]`，`ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]`，`ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]`，`ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash`，`CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash`，`CLAUDE_CODE_EFFORT_LEVEL=max` | 主 pro / 子代理 flash |
| **Codex**（OpenAI 编程助手，走 Responses API） | 一键脚本：macOS/Linux `bash <(curl -fsSL https://cdn.deepseek.com/api-docs/codex-deepseek-setup.sh)`；Windows PowerShell `irm https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.ps1 \| iex`；或手动写 `~/.codex/models.json` + `[model_providers.deepseek]`。**目前仅 `deepseek-v4-flash` 支持接入 Codex**，pro 预计 2026 年 8 月初支持 | flash |
| **OpenCode**（开源编程助手） | 升级 ≥v1.14.24，`opencode` 后输入 `/connect` → 选 `deepseek` 供应商 → 填 KEY → 选 DeepSeek-V4-Pro | pro |
| **OpenClaw**（开源个人 AI 助手） | 安装后 setup 中：Model/auth provider 选 **DeepSeek**，填 KEY，Default model 填 `deepseek-v4-pro` 或 `deepseek-v4-flash`；`openclaw dashboard` / `openclaw tui` / `openclaw terminal` | pro/flash |
| **Hermes**（Nous Research 开源 Agent） | `hermes setup` → Quick Setup → 提供商选 **DeepSeek** → 填 KEY → Base URL 填 `https://api.deepseek.com` → 选 `deepseek-v4-pro` | pro |
| **Reasonix**（以 DeepSeek 为原生后端的终端 Agent，Cache-First 设计） | 需 Node.js ≥20.10；`npx reasonix code` 启动，向导填 KEY（持久化到 `~/.reasonix/config.json`）。默认 `deepseek-v4-flash` 控制成本；TUI 内 `/pro` 切 Pro，`/preset max` 整个 session 用 Pro | 默认 flash |
| **WorkBuddy / CodeBuddy** | 写本地模型配置 `C:\Users\<你>\.codebuddy\models.json`（或项目级 `.codebuddy\models.json`），`url` 填 `https://api.deepseek.com/v1/chat/completions`，`apiKey` 用 `${DEEPSEEK_API_KEY}`（先 `setx DEEPSEEK_API_KEY`）；文件保存为 **UTF-8 无 BOM** | pro / flash |

> Claude Code 模型映射说明：`claude-opus*` → `deepseek-v4-pro`；`claude-haiku*` / `claude-sonnet*` → `deepseek-v4-flash`。使用 Claude Code 的 Web Search 功能会产生额外模型 Token 费用（模型会调用 Web Search 工具并总结搜索结果）。

> 「贡献你的 Agent 接入」相关页面未能抓取到独立入口（官方文档的接入清单见「快速开始 → 接入 Agent 工具」，上述已覆盖主流工具）。

---

## 10. 常用 API 参考

### 10.1 对话补全 Chat Completions
`POST https://api.deepseek.com/chat/completions`

请求主要字段：
- `model`（必填）：`deepseek-v4-flash` / `deepseek-v4-pro`
- `messages`（必填，≥1）：`system` / `user` / `assistant` / `tool` 消息
  - assistant 消息可选 `prefix`（Beta，需 `/beta`）、`reasoning_content`（Beta）
  - tool 消息需 `tool_call_id`
- `thinking`：`{"type": "enabled"/"disabled"}`（默认 enabled）
- `reasoning_effort`：`high` / `max`
- `max_tokens`、`response_format`（`text`/`json_object`）、`stop`（≤16 个）、`stream`、`stream_options`（`include_usage`）
- `temperature`（≤2，默认 1）、`top_p`（≤1，默认 1）
- `tools`（≤128 个 function）、`tool_choice`（none/auto/required/指定函数）
- `logprobs`、`top_logprobs`（≤20）
- `user_id`（正则 `[a-zA-Z0-9\-_]+`，≤512）
- ⚠️ `frequency_penalty` / `presence_penalty` 已**弃用**，传入无效。

响应主要字段：
- `choices[]`: `finish_reason`（`stop`/`length`/`content_filter`/`tool_calls`/`insufficient_system_resource`）、`message`（`content`、`reasoning_content`、`tool_calls[]`、`role`）
- `usage`: `prompt_tokens`、`completion_tokens`、`prompt_cache_hit_tokens`、`prompt_cache_miss_tokens`、`total_tokens`、`completion_tokens_details.reasoning_tokens`

curl：
```bash
curl -L -X POST 'https://api.deepseek.com/chat/completions' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  --data-raw '{
    "messages": [
      {"content": "You are a helpful assistant", "role": "system"},
      {"content": "Hi", "role": "user"}
    ],
    "model": "deepseek-v4-flash",
    "thinking": {"type": "enabled"},
    "reasoning_effort": "high",
    "max_tokens": 4096,
    "stream": false
  }'
```

### 10.2 FIM 补全 API（Beta）
`POST https://api.deepseek.com/beta/completions`
- 需 `base_url="https://api.deepseek.com/beta"`。
- 字段：`model`（**仅 `deepseek-v4-pro`**）、`prompt`、`suffix`、`max_tokens`、`stop`、`stream`、`temperature`、`top_p`、`echo`、`logprobs`（≤20）。
- 响应 `usage` 同样含 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`；`finish_reason` 可为 `insufficient_system_resource`。

### 10.3 列出模型
`GET https://api.deepseek.com/models`
```bash
curl -L -X GET 'https://api.deepseek.com/models' -H 'Authorization: Bearer <TOKEN>'
```
响应：`{"object":"list","data":[{"id":"deepseek-v4-flash","object":"model","owned_by":"deepseek"},{"id":"deepseek-v4-pro",...}]}`

### 10.4 查询余额
`GET https://api.deepseek.com/user/balance`
```bash
curl -L -X GET 'https://api.deepseek.com/user/balance' -H 'Authorization: Bearer <TOKEN>'
```
响应字段：`is_available`（是否有余额可调用）、`balance_infos[]`（`currency` CNY/USD、`total_balance` 总可用、`granted_balance` 赠金、`topped_up_balance` 充值余额）。

### 10.5 Responses API 参考
`POST https://api.deepseek.com/responses`（`base_url` 同主端点）
- 顶层：`model`、`input`、`instructions`（至少传其一）、`stream`、`temperature`（思考模式不生效）、`top_p`（思考模式不生效）、`max_output_tokens`、`top_logprobs`、`tools`（function/web_search）、`tool_choice`、`reasoning`（`effort` 支持，`summary` 传入不生成）、`text.format`、`user`。
- 不支持：`previous_response_id`、`conversation`、`store`、`metadata`、`include`、`background`、`prompt`、`truncation`、`service_tier`、`prompt_cache_key` / `prompt_cache_retention`（缓存自动管理）、`context_management`、`stream_options`。
- 输入 items：`message`（user/assistant/system/developer）、`function_call`、`function_call_output`、`reasoning`（明文 content）、`web_search_call` 支持。
- usage：`input_tokens`（`input_tokens_details.cached_tokens`）、`output_tokens`（`output_tokens_details.reasoning_tokens`）。
- 完整格式定义参考 OpenAI 官方 Responses API 手册。
> 说明：官方文档「Responses API 参考」独立页面（`/api/create-responses`）未能抓取到（返回 404），以上兼容性明细来自「使用 Responses API」指南页。

---

## 11. 针对本项目「省钱 + 缓存命中」的实践建议

> 以下为基于官方事实（第 2、3、4、5、6 章）的**建议**，非官方原文。

1. **最大化前缀缓存命中（最高优先级）**
   - 缓存命中单价仅为未命中的 **1/50**（flash：0.02 vs 1 元；pro：0.025 vs 3 元）。
   - 把「固定的 system 提示词 + 常驻资料/榜单说明/曲库知识」放在 `messages` 最前面且保持顺序不变，把每次变化的提问放在末尾。
   - 在返回里监控 `usage.prompt_cache_hit_tokens` 与 `prompt_cache_miss_tokens`，计算命中率，迭代 prompt 结构。

2. **日常任务用 `deepseek-v4-flash`，复杂任务用 `deepseek-v4-pro`**
   - flash 输入未命中仅 1 元、输出 2 元、并发 2500，适合大批量分析、榜单生成、翻译。
   - pro 输入 3 元、输出 6 元、并发 500，只用于真正需要强推理的场景（复杂推理/代码/深入分析）。

3. **减少 token 浪费**
   - 控制 `max_tokens`，避免生成过长或 JSON 被截断（`finish_reason="length"` 表示输出超限/上下文超限）。
   - 使用 JSON Output 时 prompt 必须含 `json` 字样与样例，避免空转输出空白直到 token 用尽。
   - 多轮对话为无状态 API，历史会逐轮累加；可对旧轮做摘要压缩，控制上下文大小（但注意别破坏前缀缓存单元）。

4. **思考模式成本控制**
   - 非思考/思考模式开销不同，且思考模式下 `temperature` 等不生效。
   - 若只是简单格式化/翻译，可设 `{"thinking": {"type": "disabled"}}`；复杂推理才开思考并设 `reasoning_effort`。

5. **工具调用（Tool Calls）**：思考模式下只要发生过工具调用，就**必须**完整回传 `reasoning_content`，否则 400；用 `messages.append(response.choices[0].message)` 最稳妥。

6. **错误处理**：对 429 做退避重试；对 402 及时提示充值；对 500/503 等待后重试；思考模式下工具调用 400 优先检查 `reasoning_content` 是否回传。

7. **并发与隔离**：一个账号 pro 并发 500 / flash 2500；若多业务共享账号，用 `user_id` 区分用户，避免互相影响调度与缓存隔离。

8. **扣费与余额**：优先扣赠送余额；用 `/user/balance` 监控余额，设置低余额告警，避免 402 中断。

---

### 附：抓取状态说明
- 成功抓取：首页/首次调用、模型与价格、Token 用量、限速与隔离、错误码、Claude Code、Codex、OpenCode、OpenClaw、Hermes、Reasonix、WorkBuddy/CodeBuddy、思考模式、多轮对话、对话前缀续写、FIM 补全、JSON Output、Tool Calls、上下文硬盘缓存、Responses API 指南、Anthropic API、对话补全参考、FIM API 参考、列出模型、查询余额。
- 未能抓取：`/api/create-responses`（Responses API 参考独立页，404；已用「使用 Responses API」指南页内容补充）、「贡献你的 Agent 接入」独立入口（未找到独立页面）。
- 说明：`deepseek-chat` / `deepseek-reasoner` 模型名已弃用，本项目的调用应统一改用 `deepseek-v4-flash` / `deepseek-v4-pro`。
