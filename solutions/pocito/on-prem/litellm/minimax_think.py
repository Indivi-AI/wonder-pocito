import os
from litellm.integrations.custom_logger import CustomLogger

TAG = os.environ.get("LITELLM_THINK_TAG", "mm:think")
OPEN, CLOSE = f"<{TAG}>", f"</{TAG}>"


def held_tag_prefix(text, tag):
    return next((n for n in range(len(tag) - 1, 0, -1) if text.endswith(tag[:n])), 0)


def split_thinking(text, thinking):
    """Returns (content, reasoning, held, thinking); held is a partial tag kept for the next chunk."""
    parts = {False: "", True: ""}
    while text:
        tag = CLOSE if thinking else OPEN
        at = text.find(tag)
        cut = at if at >= 0 else len(text) - held_tag_prefix(text, tag)
        parts[thinking] += text[:cut]
        if at < 0:
            return parts[False], parts[True], text[cut:], thinking
        text, thinking = text[at + len(tag):], not thinking
    return parts[False], parts[True], "", thinking


class ReasoningSplitter(CustomLogger):
    async def async_post_call_success_hook(self, data, user_api_key_dict, response):
        for message in (choice.message for choice in getattr(response, "choices", None) or []):
            if message.content and OPEN in message.content:
                content, reasoning, held, _ = split_thinking(message.content, False)
                message.content, message.reasoning_content = content + held, (message.reasoning_content or "") + reasoning
        return response

    async def async_post_call_streaming_iterator_hook(self, user_api_key_dict, response, request_data):
        held, thinking = "", False
        async for chunk in response:
            choice = next(iter(getattr(chunk, "choices", None) or []), None)
            if choice is None or not (choice.delta.content or held):
                yield chunk
                continue
            content, reasoning, held, thinking = split_thinking(held + (choice.delta.content or ""), thinking)
            if choice.finish_reason:
                content, held = content + held, ""
            choice.delta.content = content or None
            if reasoning:
                choice.delta.reasoning_content = (choice.delta.reasoning_content or "") + reasoning
            yield chunk


reasoning_splitter = ReasoningSplitter()
