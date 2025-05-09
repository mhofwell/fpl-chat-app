export async function echoMessage(
    { message }: { message: string },
    _extra: any
) {
    return {
        content: [{ type: 'text' as const, text: `Echo: ${message}` }],
    };
}
