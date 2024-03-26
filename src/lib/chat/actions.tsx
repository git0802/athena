import "server-only";

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  render,
  createStreamableValue,
  useAIState,
} from "ai/rsc";
import { InMemoryFileStore } from "langchain/stores/file/in_memory";

import { BotCard, BotMessage } from "@/components/genUI/message";

import { Events } from "@/components/genUI/events";

import { spinner } from "@/components/genUI/spinner";

import { SpinnerMessage, UserMessage } from "@/components/genUI/message";
import {
  StoredMessage,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";
import OpenAI from "openai";
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid,
} from "@/lib/utils";
import { Chat } from "@/lib/types";
import { ObsidianLoader } from "langchain/document_loaders/fs/obsidian";
import { Chroma } from "langchain/vectorstores/chroma";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ChatOpenAI } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { AutoGPT } from "langchain/experimental/autogpt";
import { initializeObsidianIndex } from "@/app/actions";
let cachedVectorStore: PineconeStore | null = null;
let myGPT: AutoGPT | null = null;
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { ReadFileTool, WriteFileTool } from "langchain/tools";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
export type Message = {
  role: "user" | "assistant" | "system" | "function" | "data" | "tool";
  content: string;
  id: string;
  name?: string;
};

export type UIState = {
  id: string;
  display: React.ReactNode;
}[];

export type AIState = {
  chatId: string;
  messages: Message[];
  obsidianVectorStore: PineconeStore | null;
};

async function setupVectorStore() {
  "use server";

  if (cachedVectorStore) return;

  try {
    const documents = (await initializeObsidianIndex()) || [];

    const pinecone = new Pinecone({
      apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY!,
    });
    const pineconeIndex = pinecone.Index(
      process.env.NEXT_PUBLIC_PINECONE_INDEX!
    );

    const vectorStore = await PineconeStore.fromDocuments(
      documents,
      new OpenAIEmbeddings({
        openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      }),
      {
        pineconeIndex,
        maxConcurrency: 5,
      }
    );
    console.log(vectorStore, "Vector store initialized");
    console.log("Existing vector store set successfully");
  } catch (error) {
    console.log("Initializing vector store");
    const documents = (await initializeObsidianIndex()) || [];

    const pinecone = new Pinecone({
      apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY!,
    });
    const pineconeIndex = pinecone.Index(
      process.env.NEXT_PUBLIC_PINECONE_INDEX!
    );

    const vectorStore = await PineconeStore.fromDocuments(
      documents,
      new OpenAIEmbeddings({
        openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      }),
      {
        pineconeIndex,
        maxConcurrency: 5,
      }
    );
    console.log(vectorStore, "Vector store initialized");
  }
}

async function initializeAutoGPT() {
  "use server";
  const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
  });
  const store = new InMemoryFileStore();
  if (!cachedVectorStore) {
    console.log("No cached vector store found, initializing...");
    await setupVectorStore();
  }

  const tools = [
    new ReadFileTool({ store }),
    new WriteFileTool({ store }),
    new SerpAPI(process.env.NEXT_PUBLIC_SERPAPI_API_KEY!, {
      location: "San Francisco,California,United States",
      hl: "en",
      gl: "us",
    }),
  ];
  const embeds = new OpenAIEmbeddings({
    openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  });
  const getDefaultRetriever = () => {
    const defaultVectorStore = new MemoryVectorStore(embeds);
    return defaultVectorStore.asRetriever();
  };
  myGPT = AutoGPT.fromLLMAndTools(
    new ChatOpenAI({
      temperature: 0,
      openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    }),
    tools,
    {
      memory: cachedVectorStore
        ? cachedVectorStore.asRetriever()
        : getDefaultRetriever(),
      aiName: "Athena",
      aiRole: "Assistant",
      humanInTheLoop: true,
      maxIterations: 3,
    }
  );
}

// TODO: -update vectorstore method
async function runAutoGPT(content: string) {
  "use server";
  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>;
  let textNode: undefined | React.ReactNode;
  const aiState = getMutableAIState<typeof AI>();

  if (!myGPT) {
    await initializeAutoGPT();
  }

  const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
  });
  const store = new InMemoryFileStore();
  if (!cachedVectorStore) {
    console.log("No cached vector store found, initializing...");
    await setupVectorStore();
  }

  var searchResults;
  if (cachedVectorStore) {
    searchResults = await cachedVectorStore?.similaritySearch(content, 3);
  }

  // Combine the search results into a single string
  const contextText = searchResults
    ?.map((result) => result.pageContent)
    .join("\n\n");

  const updatedMessageHistory = aiState.get().messages.map((message: any) => {
    const baseMessage: StoredMessage = {
      type: "message", // You may need to adjust this based on your application's needs
      data: {
        content: message.content,
        name: message.name,
        role: message.role, // Assuming 'role' exists in your 'message' object
        tool_call_id: undefined, // Assuming 'tool_call_id' is not available in your 'message' object
        additional_kwargs: {},
        response_metadata: {},
      },
    };
    return baseMessage;
  });

  const finalMessages = mapStoredMessagesToChatMessages(updatedMessageHistory);
  myGPT!.fullMessageHistory = finalMessages;

  const result = await myGPT!.run([content]);
  console.log(result, "result");

  const ui = render({
    model: "gpt-4",
    provider: openai,
    initial: <SpinnerMessage />,
    messages: [
      {
        role: "system",
        content: `...`,
      },
      {
        role: "user",
        content: `Here is some additional context from my knowledge base:\n\n${contextText}\n\nPlease use this information to help answer the following question:\n\n${content}`,
      },
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name,
      })),
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue("");
        textNode = <BotMessage content={result || ""} />;
      }

      if (done) {
        textStream.done();
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: "assistant",
              content,
            },
          ],
        });
      } else {
        textStream.update(delta);
      }

      return textNode;
    },
  });

  // Update the UI with the latest result
  textNode = ui;

  return {
    id: nanoid(),
    display: textNode,
  };
}

async function submitUserMessage(content: string) {
  "use server";

  const aiState = getMutableAIState<typeof AI>();

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>;
  let textNode: undefined | React.ReactNode;

  const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
  });

  // Search the Obsidian vector store based on the user's message
  const obsidianVectorStore = aiState.get().obsidianVectorStore;
  if (!cachedVectorStore) {
    console.log("No cached vector store found, initializing...");
    await setupVectorStore();
  }

  var searchResults;
  if (cachedVectorStore) {
    searchResults = await cachedVectorStore?.similaritySearch(content, 3);
  }

  // Combine the search results into a single string
  const contextText = searchResults
    ?.map((result) => result.pageContent)
    .join("\n\n");

  const ui = render({
    model: "gpt-4",
    provider: openai,
    initial: <SpinnerMessage />,
    messages: [
      {
        role: "system",
        content: `...`,
      },
      {
        role: "user",
        content: `Here is some additional context from my knowledge base:\n\n${contextText}\n\nPlease use this information to help answer the following question:\n\n${content}`,
      },
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name,
      })),
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue("");
        textNode = <BotMessage content={textStream.value} />;
      }

      if (done) {
        textStream.done();
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: "assistant",
              content,
            },
          ],
        });
      } else {
        textStream.update(delta);
      }

      return textNode;
    },
  });

  return {
    id: nanoid(),
    display: ui,
  };
}

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    setupVectorStore,
    runAutoGPT,
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [], obsidianVectorStore: null },
  unstable_onGetUIState: async () => {
    "use server";

    const aiState = getAIState();

    if (aiState) {
      const uiState = getUIStateFromAIState(aiState);
      return uiState;
    }
  },

  unstable_onSetAIState: async ({ state, done }) => {
    "use server";

    const { chatId, messages } = state;

    const createdAt = new Date();
    const userId = "defaultUser";
    const path = `/chat/${chatId}`;
    const title = messages[0].content.substring(0, 100);

    const chat: Chat = {
      id: chatId,
      title,
      userId,
      createdAt,
      messages,
      path,
    };
  },
});

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter((message) => message.role !== "system")
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === "function" ? (
          <BotCard>
            <Events props={JSON.parse(message.content)} />
          </BotCard>
        ) : message.role === "user" ? (
          <UserMessage>{message.content}</UserMessage>
        ) : (
          <BotMessage content={message.content} />
        ),
    }));
};

// initializeObsidianIndex()

// Move the logic from unstable_onInit to a separate function

// Call the initializeObsidianIndex function separately
