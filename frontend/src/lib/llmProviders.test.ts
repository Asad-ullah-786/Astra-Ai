import { describe, expect, it } from "vitest";
import {
  getCloudModelPricingLabel,
  getLLMStatusCards,
  getLocalModelDownloadQueue,
  getLocalModelOverviewCards,
} from "./llmProviders.ts";
import type { AIStatus } from "../types/index.ts";

const connectedAI: AIStatus = {
  connected: true,
  selected_model: "qwen2.5:1.5b",
  models: [
    { name: "qwen2.5:1.5b", size: 1_000_000_000, parameter_size: "1.5B", modified_at: null },
  ],
  clients: { claude_code: false, cursor: true, copilot: true },
  gemini: { configured: false, connected: false, models: [], error: null },
  error: null,
};

describe("local model overview", () => {
  it("shows the reference model cards using installed Ollama models only", () => {
    const cards = getLocalModelOverviewCards({
      ...connectedAI,
      models: [
        ...connectedAI.models,
        { name: "llama3.2:1b", size: 1_300_000_000, parameter_size: "1B", modified_at: null },
        { name: "mistral:7b", size: 4_000_000_000, parameter_size: "7B", modified_at: null },
      ],
    });

    expect(cards.map((card) => card.name)).toEqual(["Ollama", "Mistral", "Llama", "Qwen", "DeepSeek-R1", "Phi-3", "Gemma"]);
    expect(cards.find((card) => card.id === "ollama")).toMatchObject({ status: "Active", state: "connected" });
    expect(cards.find((card) => card.id === "mistral")).toMatchObject({ status: "7B Model", state: "available" });
    expect(cards.find((card) => card.id === "llama")).toMatchObject({ status: "1B Model", state: "available" });
    expect(cards.find((card) => card.id === "qwen")).toMatchObject({
      status: "1.5B Model",
      selected: true,
      modelName: "qwen2.5:1.5b",
    });
    expect(cards.find((card) => card.id === "phi")).toMatchObject({ status: "Available soon", state: "unavailable" });
    expect(cards.find((card) => card.id === "deepseek")).toMatchObject({ status: "Available soon", state: "unavailable" });
  });

  it("does not mark local models active while Ollama is offline or still loading", () => {
    expect(getLocalModelOverviewCards(null)[0]).toMatchObject({ status: "Checking…", state: "checking" });
    expect(getLocalModelOverviewCards({ ...connectedAI, connected: false })[2])
      .toMatchObject({ status: "Ollama offline", state: "unavailable" });
  });

  it("marks DeepSeek available in the overview when its Ollama model is installed", () => {
    const deepseek = getLocalModelOverviewCards({
      ...connectedAI,
      models: [
        ...connectedAI.models,
        { name: "deepseek-r1:1.5b", size: 1_100_000_000, parameter_size: "1.5B", modified_at: null },
      ],
    }).find((card) => card.id === "deepseek");

    expect(deepseek).toMatchObject({
      status: "1.5B Model",
      state: "available",
      modelName: "deepseek-r1:1.5b",
    });
  });

  it("shows verified downloads as installed, the next model as downloading, and later models as queued", () => {
    const queue = getLocalModelDownloadQueue({
      ...connectedAI,
      models: [
        ...connectedAI.models,
        { name: "gemma3:270m-it-qat", size: 241_000_000, parameter_size: "268M", modified_at: null },
        { name: "deepseek-r1:1.5b", size: 1_100_000_000, parameter_size: "1.8B", modified_at: null },
        { name: "phi3:3.8b-mini-128k-instruct-q2_K", size: 1_400_000_000, parameter_size: "3.8B", modified_at: null },
      ],
    });

    expect(queue.map((item) => item.status)).toEqual([
      "Installed",
      "Installed",
      "Installed",
      "Downloading · 3.1 GB",
    ]);
  });
});

describe("LLM status catalog", () => {
  it("shows installed Mistral as available in the dashboard model status", () => {
    const cards = getLLMStatusCards({
      ...connectedAI,
      models: [
        ...connectedAI.models,
        { name: "mistral:7b-instruct-q2_K", size: 3_084_046_568, parameter_size: "7B", modified_at: null },
      ],
    });

    expect(cards.find((card) => card.id === "mistral")).toMatchObject({
      status: "Installed · local",
      state: "connected",
    });
  });

  it("reports local model availability from Ollama and leaves unconfigured integrations inactive", () => {
    const cards = getLLMStatusCards(connectedAI);
    const mistral = cards.find((card) => card.id === "mistral");
    const qwen = cards.find((card) => card.id === "qwen");
    const llama = cards.find((card) => card.id === "llama");
    const openAI = cards.find((card) => card.id === "openai");
    const gemini = cards.find((card) => card.id === "gemini");
    const cursor = cards.find((card) => card.id === "cursor");
    const copilot = cards.find((card) => card.id === "copilot");

    expect(cards).toHaveLength(9);
    expect(mistral).toMatchObject({ status: "Available soon", state: "unavailable" });
    expect(qwen).toMatchObject({ status: "Selected · local", state: "connected" });
    expect(llama).toMatchObject({ status: "Available soon", state: "unavailable" });
    expect(openAI).toMatchObject({ status: "Setup required", state: "setup" });
    expect(gemini).toMatchObject({ status: "Setup required", state: "setup" });
    expect(cursor).toMatchObject({ status: "Installed · connection needed", state: "setup" });
    expect(copilot).toMatchObject({ status: "Installed · connection needed", state: "setup" });
  });

  it("asks the user to connect Cursor and Copilot on their own PC when not detected", () => {
    const cards = getLLMStatusCards({
      ...connectedAI,
      clients: { claude_code: false, cursor: false, copilot: false },
    });

    expect(cards.find((card) => card.id === "cursor"))
      .toMatchObject({ status: "Needs connection · connect on this PC", state: "setup" });
    expect(cards.find((card) => card.id === "copilot"))
      .toMatchObject({ status: "Needs connection · connect on this PC", state: "setup" });
  });

  it("reports Gemini connection and selected-model state from the real API status", () => {
    const available = getLLMStatusCards({
      ...connectedAI,
      gemini: { configured: true, connected: true, models: ["gemini-2.5-flash"], error: null },
    }).find((card) => card.id === "gemini");
    const selected = getLLMStatusCards({
      ...connectedAI,
      selected_model: "gemini:gemini-2.5-flash",
      gemini: { configured: true, connected: true, models: ["gemini-2.5-flash"], error: null },
    }).find((card) => card.id === "gemini");
    const noneAvailable = getLLMStatusCards({
      ...connectedAI,
      gemini: { configured: true, connected: true, models: [], error: null },
    }).find((card) => card.id === "gemini");
    const failed = getLLMStatusCards({
      ...connectedAI,
      gemini: { configured: true, connected: false, models: [], error: "API key rejected" },
    }).find((card) => card.id === "gemini");

    expect(available).toMatchObject({ status: "Connected · models listed", state: "available" });
    expect(selected).toMatchObject({ status: "Selected · cloud API", state: "connected" });
    expect(noneAvailable).toMatchObject({ status: "No compatible chat models", state: "unavailable" });
    expect(failed).toMatchObject({ status: "Connection failed", state: "unavailable" });
  });

  it("reports OpenAI as available only when its API status confirms the connection", () => {
    const available = getLLMStatusCards({
      ...connectedAI,
      openai: { configured: true, connected: true, models: ["gpt-4.1-mini"], error: null },
    }).find((card) => card.id === "openai");
    const selected = getLLMStatusCards({
      ...connectedAI,
      selected_model: "openai:gpt-4.1-mini",
      openai: { configured: true, connected: true, models: ["gpt-4.1-mini"], error: null },
    }).find((card) => card.id === "openai");
    const failed = getLLMStatusCards({
      ...connectedAI,
      openai: { configured: true, connected: false, models: [], error: "API key rejected" },
    }).find((card) => card.id === "openai");
    const noFreeModels = getLLMStatusCards({
      ...connectedAI,
      openai: { configured: true, connected: true, models: [], error: null },
    }).find((card) => card.id === "openai");

    expect(available).toMatchObject({ status: "Connected · models listed", state: "available" });
    expect(selected).toMatchObject({ status: "Selected · cloud API", state: "connected" });
    expect(noFreeModels).toMatchObject({ status: "No compatible chat models", state: "unavailable" });
    expect(failed).toMatchObject({ status: "Connection failed", state: "unavailable" });
  });

  it("labels free-tier Gemini models and paid Gemini/OpenAI models", () => {
    expect(getCloudModelPricingLabel("gemini", "gemini-2.5-flash")).toBe("Free tier");
    expect(getCloudModelPricingLabel("gemini", "gemini-2.5-flash-lite")).toBe("Free tier");
    expect(getCloudModelPricingLabel("gemini", "gemma-4-31b-it")).toBe("Free tier");
    expect(getCloudModelPricingLabel("gemini", "gemini-4-carbon")).toBe("Paid");
    expect(getCloudModelPricingLabel("openai", "gpt-4.1-mini")).toBe("Paid");
  });

  it("does not imply a model is available when Ollama is offline or still loading", () => {
    expect(getLLMStatusCards({ ...connectedAI, connected: false })[0])
      .toMatchObject({ status: "Ollama offline", state: "unavailable" });
    expect(getLLMStatusCards(null)[0])
      .toMatchObject({ status: "Checking Ollama…", state: "checking" });
  });
});
