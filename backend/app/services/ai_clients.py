import shutil


_CLIENT_COMMANDS = {
    "claude_code": ("claude",),
    "cursor": ("cursor",),
    "copilot": ("copilot",),
}


def available_ai_clients() -> dict[str, bool]:
    return {
        client: any(shutil.which(command) for command in commands)
        for client, commands in _CLIENT_COMMANDS.items()
    }
