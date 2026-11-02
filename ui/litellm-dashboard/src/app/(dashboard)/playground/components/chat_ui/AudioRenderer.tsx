"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import React from "react";
import { MessageType } from "@/components/chat_ui/types";

interface AudioRendererProps {
  message: MessageType;
}

const AudioRenderer: React.FC<AudioRendererProps> = (cocaCopyProps0) => {
  const { message } = cocaCopyProps0;
  useUiLocale();
  // Check if this message contains audio
  if (!message.isAudio || typeof message.content !== "string") {
    return null;
  }

  return (
    <div className="mb-2">
      <audio controls src={message.content} className="max-w-full" style={{ maxWidth: "500px" }}>
        <LocalizedText text={"Your browser does not support the audio element."} />
      </audio>
    </div>
  );
};

export default AudioRenderer;
