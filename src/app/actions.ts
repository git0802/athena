"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
// import { kv } from '@vercel/kv'
// import { auth } from '@/auth'
import { useAIState, useUIState, getMutableAIState } from "ai/rsc";
import { ObsidianLoader } from "langchain/document_loaders/fs/obsidian";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { type Chat } from "@/lib/types";
import { PineconeStore } from "@langchain/pinecone";
import { nanoid } from "ai";
import { AI } from "@/lib/chat/actions";

async function setupVectorStore() {
  const pinecone = new Pinecone({
    apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY!,
  });
  const pineconeIndex = pinecone.Index(process.env.NEXT_PUBLIC_PINECONE_INDEX!);

  const existingVectorStore = await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({
      openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    }),
    { pineconeIndex }
  );
  console.log(existingVectorStore, "Existing vector store");

  console.log("Existing vector store fetched successfully");
  const aiState = getMutableAIState<typeof AI>();

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: "user",
        content: "",
      },
    ],
    obsidianVectorStore: existingVectorStore,
  });
}

export async function initializeObsidianIndex() {
  try {
    console.log("Before loading obsidian");
    const loader = new ObsidianLoader("../markdownFiles");

    console.log("Before loading docs");
    const docs = await loader.load();
    console.log("After loading docs", docs.length);

    const docsWithContent = docs.filter(
      (doc) => doc && doc.pageContent && doc.pageContent.trim() !== ""
    );
    console.log("After filtering docs", docsWithContent.length);

    const embedder = new OpenAIEmbeddings({
      openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    });

    const documentsToEmbed = docsWithContent
      .filter((doc) => doc && doc.pageContent && doc.pageContent.trim() !== "")
      .map((doc) => ({
        pageContent: doc.pageContent,
        metadata: doc.metadata,
      }));

    const texts = documentsToEmbed.map((doc) => doc.pageContent);
    const embeddings = await embedder.embedDocuments(texts);

    if (embeddings.length !== documentsToEmbed.length) {
      throw new Error(
        "Mismatch between the number of embeddings and documents"
      );
    }

    const documents = documentsToEmbed.map((doc, index) => ({
      pageContent: doc.pageContent,
      embedding: embeddings[index],
      metadata: doc.metadata,
    }));
    console.log("fishing in the sea");

    return documents;
  } catch (error) {
    console.error("Error initializing Obsidian index:", error);
    // Handle the error appropriately (e.g., show an error message to the user)
    return;
  }
}

export async function testChromaInitialization() {
  try {
    const embedder = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const documents = [
      { pageContent: "Test document 1", metadata: { source: "test" } },
      { pageContent: "Test document 2", metadata: { source: "test" } },
    ];

    const vectorStore = await Chroma.fromDocuments(documents, embedder, {
      collectionName: "test_collection",
      url: "http://localhost:8000",
    });
    console.log("Vector Store:", vectorStore);

    console.log("Chroma initialization test successful");
    return vectorStore.toJSON();
  } catch (error) {
    console.error("Error in Chroma initialization test:", error);
    return null;
  }
}
// export async function getChats(userId?: string | null) {
//   if (!userId) {
//     return []
//   }

//   try {
//     const pipeline = kv.pipeline()
//     const chats: string[] = await kv.zrange(`user:chat:${userId}`, 0, -1, {
//       rev: true
//     })

//     for (const chat of chats) {
//       pipeline.hgetall(chat)
//     }

//     const results = await pipeline.exec()

//     return results as Chat[]
//   } catch (error) {
//     return []
//   }
// }

// export async function getChat(id: string, userId: string) {
//   const chat = await kv.hgetall<Chat>(`chat:${id}`)

//   if (!chat || (userId && chat.userId !== userId)) {
//     return null
//   }

//   return chat
// }

// export async function removeChat({ id, path }: { id: string; path: string }) {
//   const session = await auth()

//   if (!session) {
//     return {
//       error: 'Unauthorized'
//     }
//   }

//   //Convert uid to string for consistent comparison with session.user.id
//   const uid = String(await kv.hget(`chat:${id}`, 'userId'))

//   if (uid !== session?.user?.id) {
//     return {
//       error: 'Unauthorized'
//     }
//   }

//   await kv.del(`chat:${id}`)
//   await kv.zrem(`user:chat:${session.user.id}`, `chat:${id}`)

//   revalidatePath('/')
//   return revalidatePath(path)
// }

// export async function clearChats() {
//   const session = await auth()

//   if (!session?.user?.id) {
//     return {
//       error: 'Unauthorized'
//     }
//   }

//   const chats: string[] = await kv.zrange(`user:chat:${session.user.id}`, 0, -1)
//   if (!chats.length) {
//     return redirect('/')
//   }
//   const pipeline = kv.pipeline()

//   for (const chat of chats) {
//     pipeline.del(chat)
//     pipeline.zrem(`user:chat:${session.user.id}`, chat)
//   }

//   await pipeline.exec()

//   revalidatePath('/')
//   return redirect('/')
// }

// export async function getSharedChat(id: string) {
//   const chat = await kv.hgetall<Chat>(`chat:${id}`)

//   if (!chat || !chat.sharePath) {
//     return null
//   }

//   return chat
// }

// export async function shareChat(id: string) {
//   const session = await auth()

//   if (!session?.user?.id) {
//     return {
//       error: 'Unauthorized'
//     }
//   }

//   const chat = await kv.hgetall<Chat>(`chat:${id}`)

//   if (!chat || chat.userId !== session.user.id) {
//     return {
//       error: 'Something went wrong'
//     }
//   }

//   const payload = {
//     ...chat,
//     sharePath: `/share/${chat.id}`
//   }

//   await kv.hmset(`chat:${chat.id}`, payload)

//   return payload
// }

// export async function saveChat(chat: Chat) {
//   const session = await auth()

//   if (session && session.user) {
//     const pipeline = kv.pipeline()
//     pipeline.hmset(`chat:${chat.id}`, chat)
//     pipeline.zadd(`user:chat:${chat.userId}`, {
//       score: Date.now(),
//       member: `chat:${chat.id}`
//     })
//     await pipeline.exec()
//   } else {
//     return
//   }
// }

// export async function refreshHistory(path: string) {
//   redirect(path)
// }

// export async function getMissingKeys() {
//   const keysRequired = ['OPENAI_API_KEY']
//   return keysRequired
//     .map(key => (process.env[key] ? '' : key))
//     .filter(key => key !== '')
// }
