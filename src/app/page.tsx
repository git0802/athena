import Image from "next/image";
import { AI } from '@/lib/chat/actions'
import { nanoid } from "ai";
// import { auth } from '@/auth'
import { Chat } from "@/components/chat/chat";


export default function Home() {
  const id = nanoid()

  return (
    <AI initialAIState={{ chatId: id, messages: [], obsidianVectorStore: null }}>
    <Chat id={id} session={undefined} missingKeys={[]} />
    </AI>
  );
}
