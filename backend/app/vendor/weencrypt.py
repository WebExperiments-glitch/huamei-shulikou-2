"""网易云 WeAPI 加密（自实现，MIT）。

与 netease_encode_api（AGPLv3，已弃用）功能对等，但本文件为项目自有实现，
采用网易云公开逆向算法：AES-128-CBC 二次加密 + 教科书式 RSA 加密 secKey。

算法与 pyncm (Apache-2.0) 的 WeapiEncrypt 完全一致，仅依赖 pycryptodome（项目已锁定）。
仅用于本项目调用网易云 weapi 接口，请遵守网易云平台服务条款。
"""
from __future__ import annotations

import base64
import json
import random
import string

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

# 网易云 weapi 固定参数（公开逆向常量）
_WEAPI_AES_KEY = "0CoJUm6Qyw8W8jud"
_WEAPI_AES_IV = "0102030405060708"
_WEAPI_RSA_PUBKEY = (
    "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876"
    "aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05"
    "c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289"
    "dc6935b3ece0462db0a22b8e7"
)
_WEAPI_RSA_PUBEXP = 0x10001


def _rand_str(n: int = 16) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=n))


def _aes_cbc_encrypt(data: str, key: str) -> bytes:
    cipher = AES.new(key.encode("utf-8"), AES.MODE_CBC, _WEAPI_AES_IV.encode("utf-8"))
    return cipher.encrypt(pad(data.encode("utf-8"), AES.block_size))


def _rsa_encrypt(text: str) -> str:
    # 网易云使用「无填充」教科书式 RSA，且将明文字节反转后做大数幂模。
    e = int(_WEAPI_RSA_PUBKEY, 16)
    n = _WEAPI_RSA_PUBEXP
    reversed_hex = "".join(reversed(text)).encode("utf-8").hex()
    m = int(reversed_hex, 16)
    r = pow(m, e, n)
    return f"{r:0256x}"


def weapi_encrypt(params: dict) -> dict:
    """对请求体做 weapi 加密，返回 {params, encSecKey}。

    与旧版 netease SDK（AGPLv3，已弃用）/ pyncm（Apache-2.0）的 WeapiEncrypt 输出一致。
    """
    text = json.dumps(params, separators=(",", ":"))
    # 第一层：AES(key=0CoJ..., iv=0102..., CBC)
    k1 = base64.b64encode(_aes_cbc_encrypt(text, _WEAPI_AES_KEY)).decode("utf-8")
    # 第二层：AES(key=随机16位, iv 同上, CBC)
    aes_key2 = _rand_str(16)
    k2 = base64.b64encode(_aes_cbc_encrypt(k1, aes_key2)).decode("utf-8")
    # 第三层：RSA 加密第二层 key 得到 encSecKey
    enc_sec_key = _rsa_encrypt(aes_key2)
    return {"params": k2, "encSecKey": enc_sec_key}
