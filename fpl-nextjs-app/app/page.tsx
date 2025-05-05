import Navbar from "@/components/layout/navbar";
import PublicChatUI from "@/components/chat/public-chat-ui";

export default async function Home() {
  return (
    <>
      <div className="w-full flex flex-col items-center">
        <Navbar />
        
        <main className="flex-1 flex flex-col items-center w-full max-w-5xl px-4 py-8">
          <h1 className="text-3xl font-bold mb-2 text-center">
            Fantasy Premier League Chat Assistant
          </h1>
          <p className="text-lg text-muted-foreground mb-8 text-center max-w-2xl">
            Get instant answers to all your FPL questions - stats, players, strategies, and more
          </p>
          
          <div className="w-full max-w-3xl mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">FPL Chat</h2>
              <p className="text-sm text-muted-foreground">Your conversations are saved automatically</p>
            </div>
          </div>
          
          <PublicChatUI />
        </main>
      </div>
    </>
  );
}
