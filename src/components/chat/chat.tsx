"use client";
// import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import * as React from "react";
import {
  initializeObsidianIndex,
  testChromaInitialization,
} from "@/app/actions";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Session } from "@/lib/types";
import { AIState, Message, AI } from "@/lib/chat/actions";
import { ChatList } from "@/components/chat/chat-list";
import { cn } from "@/lib/utils";
import { useUIState, useAIState } from "ai/rsc";
import { EmptyScreen } from "@/components/empty-screen";
import { ChatScrollAnchor } from "@/components/chat/chat-scroll-anchor";
import { ChatPanel } from "./chat-panel";
import { cache } from "react";
import { Chroma } from "langchain/vectorstores/chroma";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ObsidianLoader } from "langchain/document_loaders/fs/obsidian";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { useActions } from "ai/rsc";

export interface ChatProps extends React.ComponentProps<"div"> {
  initialMessages?: Message[];
  id?: string;
  session?: Session;
  missingKeys: string[];
}
// const loadIndex = cache(async () => {
//   console.log("brokies")
//   return await initializeObsidianIndex()
// })
export function Chat({ id, className, session, missingKeys }: ChatProps) {
  const router = useRouter();
  const path = usePathname();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useUIState();
  const [aiState, setAIState] = useAIState();
  const isLoading = true;

  const { setupVectorStore } = useActions();

  const fetchExistingVectorStore = async () => {
    try {
      console.log("Fetching existing vector store");
      const loader = new ObsidianLoader("@/markdownFiles");
      const docs = await loader.load();
      console.log("After loading docs", docs.length);
      await setupVectorStore();
    } catch (error) {
      console.error("Error in fetching existing vector store:", error);
    }
  };

  React.useEffect(() => {
    fetchExistingVectorStore();
  }, []);

  return (
    <>
      <div className={cn("pb-[200px] pt-4 md:pt-10", className)}>
        {messages.length ? (
          <>
            <ChatList messages={messages} isShared={false} session={session} />
            <ChatScrollAnchor trackVisibility={isLoading} />
          </>
        ) : (
          <EmptyScreen setInput={setInput} />
        )}
      </div>
      <ChatPanel id={id} input={input} setInput={setInput} />
    </>
  );
}
