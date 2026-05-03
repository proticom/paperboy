<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# what are some of the latest multimodal on device cpu only llm models like gemma 3b?

Several new small multimodal / on‑device‑friendly models are in the same “class” as a Gemma‑style CPU model, usually in the 1–4B range and with image support via a lightweight vision encoder.

## Key families to look at

### Llama 3.2 (1B \& 3B)

- Meta’s Llama 3.2 1B and 3B variants are explicitly positioned as edge / on‑device models and can run on CPU or browser via libraries like llama.cpp and WebGPU.[^1_1][^1_2]
- The 3B size is generally the upper end of what’s comfortable on CPU‑only laptops, while 1B is aimed at phones and low‑RAM devices.[^1_2][^1_1]
- 3.2 adds vision capability (images) with minimal overhead, so you can do basic multimodal reasoning while staying within a small parameter budget.[^1_3][^1_2]


### Phi‑3 Mini (3.8B)

- Phi‑3 Mini is a 3.8B parameter “small language model” designed to run on CPU and mobile when optimized with ONNX Runtime.[^1_4][^1_5]
- It’s text‑only out of the box, but there are community multimodal variants that pair Phi‑3 with a small vision backbone; the base model is already proven to run on phones and Raspberry Pi‑class devices (though slower there).[^1_6][^1_4]


### Gemma 2 / Gemma 3 small variants

- Google’s Gemma 2 2B is tuned for edge and can run on phones, Raspberry Pi, and Jetson‑class devices with CPU‑only backends (e.g., via MediaPipe or llama.cpp).[^1_7][^1_8][^1_9]
- Newer Gemma 3 1B (and similar <3B configs) focus on CPU‑friendliness; with int4 quantization they can fit comfortably in 0.5–2 GB RAM while keeping quality close to full precision.[^1_1]


### SmolLM2 (≈1.7B) and similar SLMs

- SmolLM2 sits in the 1.5–2B range and is often recommended as a CPU‑only “sweet spot” model: significantly better than 1B, but still easy to run on commodity laptops.[^1_1]
- It’s primarily text‑only; multimodality is usually added via a small vision tower, similar to how LLaVA‑style models are built.[^1_3][^1_1]


### DeepSeek R1 small (≈1.5B)

- The small DeepSeek R1 variants (~1.5B) are another CPU‑optimized option; they trade some breadth for speed and low memory, making them suited to command‑line agents or light assistants on laptops.[^1_1]
- Like many SLMs, they rely on external vision encoders for full multimodality, but the language core is compact and efficient.[^1_3][^1_1]


## What’s practical on pure CPU today

- For “just works on a laptop CPU” with 8–16 GB RAM, the most approachable multimodal‑capable cores today are: Llama 3.2 1B/3B, Gemma 2 2B / Gemma 3 1B‑class, and Phi‑3 Mini at aggressive quantization.[^1_4][^1_2][^1_1]
- If you care more about raw speed and agent‑y use (tool calling, coding assistants) than multimodal depth, SmolLM2 and DeepSeek R1 small models are strong CPU‑first text cores that you can pair with a tiny vision encoder for image support.[^1_3][^1_1]

If you tell me your target device (e.g., M‑series Mac, x86 server, Android phone, Pi/edge box) and RAM budget, I can narrow this to specific model + quantization configs and likely tokens/sec.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15]</span>

<div align="center">⁂</div>

[^1_1]: https://www.kolosal.ai/blog-detail/top-5-best-llm-models-to-run-locally-in-cpu-2025-edition

[^1_2]: https://huggingface.co/blog/llama32

[^1_3]: https://blog.unitlab.ai/top-multimodal-models/

[^1_4]: https://towardsdatascience.com/small-language-models-using-3-8b-phi-3-and-8b-llama-3-models-on-a-pc-and-raspberry-pi-9ed70127fe61/

[^1_5]: https://azure.microsoft.com/en-us/blog/introducing-phi-3-redefining-whats-possible-with-slms/

[^1_6]: https://www.reddit.com/r/LocalLLaMA/comments/1cb6cuu/phi3_weights_released_microsoftphi3mini4kinstruct/

[^1_7]: https://ai.google.dev/gemma/docs/integrations/mobile

[^1_8]: https://yourstory.com/2025/05/google-gemma-ai-smartphone-model-device-2025

[^1_9]: https://hackmd.io/@asierarranz/rJhr5tUt0

[^1_10]: https://developers.googleblog.com/gemma-explained-new-in-gemma-2/

[^1_11]: https://deepmind.google/models/gemma/

[^1_12]: https://meetcody.ai/blog/gemma-2-2b-architecture-innovations-and-applications/

[^1_13]: https://www.reddit.com/r/LocalLLM/comments/1fxmzfd/llama_32_3b_very_fast_on_cpu_only_but_its_a/

[^1_14]: https://www.linkedin.com/pulse/how-run-llama-32-1b-cpu-very-cost-efficient-thomas-rossi-hchkf

[^1_15]: https://www.ibm.com/think/topics/google-gemma


---

# which of these would be good at converting pdf files to markdown without hallucination

For PDF→Markdown, none of these models are “non‑hallucinating” by themselves; the reliable path is: external PDF parser for ground‑truth text/structure, then a small model constrained to just reformat that text.[^2_1][^2_2]

## General reliability considerations

- Vision or “read the raw PDF” is where models hallucinate most; people report that even strong models like Llama 3.2 will summarize, drop sections, or invent details if asked to convert whole PDFs directly.[^2_3][^2_4][^2_1]
- Hallucinations spike when the model must both *extract* and *interpret* content (especially tables, headings, and numbers), so you want deterministic extraction plus a model that is only allowed to rearrange tokens into Markdown.[^2_5][^2_2][^2_1]


## Among your short‑list

Given Llama 3.2 (1B/3B), Phi‑3 Mini, Gemma‑2/3 small:

- **Best default core for this use‑case:**
Phi‑3 Mini has very strong language fidelity at small size and does well on structured transformation tasks (code, formats) in benchmarks, making it a good CPU‑only workhorse for “format this text exactly, don’t add content.”[^2_6]
- **Also solid:**
Llama 3.2 3B Instruct is widely used in RAG / extraction setups and has an instruction format that makes it relatively easy to enforce “no extra content, only transform the provided text.”[^2_7][^2_8][^2_4]
- **Less attractive for low‑hallucination conversion:**
Small Gemma 2 2B variants show comparatively high hallucination rates on some evaluation setups, especially with numbers and symbolic structure, which is exactly what you care about in conversions.[^2_9][^2_5]

So out of the models you mentioned, I’d prioritize **Phi‑3 Mini** or **Llama 3.2 3B** as the CPU‑only text core, and I’d avoid having any of them “read” PDFs directly; instead:

1. Use a deterministic extractor (e.g., pdfminer, unstructured, or llms‑agnostic tools) to get plain text + layout.[^2_1]
2. Feed small chunks plus layout hints into Phi‑3/Llama with a strict prompt like: “Convert exactly this text to GitHub‑flavored Markdown. Do not add, remove, or paraphrase any words.”
3. Optionally add a checksum or line‑count constraint per chunk to detect hallucinations.

If you share your typical PDF length and CPU specs (e.g., M2 Pro 16‑core, 32 GB), I can suggest specific quantization levels and chunking strategy tuned for your hardware.
<span style="display:none">[^2_10][^2_11][^2_12][^2_13][^2_14][^2_15]</span>

<div align="center">⁂</div>

[^2_1]: https://www.reddit.com/r/LocalLLaMA/comments/1gdf3yd/in_your_experience_using_llama_32_11b_to_extract/

[^2_2]: https://www.vectara.com/blog/do-smaller-models-hallucinate-more

[^2_3]: https://www.youtube.com/watch?v=grFuw0mzByc

[^2_4]: https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_2/

[^2_5]: https://arxiv.org/html/2509.09715v1

[^2_6]: https://arxiv.org/pdf/2404.14219.pdf

[^2_7]: https://haystack.deepset.ai/cookbook/llama32_agentic_rag

[^2_8]: https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct

[^2_9]: https://arxiv.org/html/2408.00118v1

[^2_10]: https://arxiv.org/html/2510.04302v1

[^2_11]: https://aclanthology.org/2025.emnlp-main.1239.pdf

[^2_12]: https://www.reddit.com/r/LocalLLaMA/comments/1cbt78y/how_good_is_phi3mini_for_everyone/

[^2_13]: https://arxiv.org/pdf/2510.05003.pdf

[^2_14]: https://github.com/vectara/hallucination-leaderboard

[^2_15]: https://huggingface.co/spaces/vectara/Hallucination-evaluation-leaderboard


---

# why aren't you considering the gemma 3b models

Two reasons: current evidence on Gemma’s hallucination profile, and the specifics of your “PDF → Markdown with no invention” use‑case.

## Hallucination behavior in Gemma 2/3

- Studies on Gemma 2 show very high hallucination rates on symbol‑heavy tasks (numbers, entities, structured text) even at larger sizes, with the 2B model around 79% hallucination in their symbolic tests and only modest improvement as you scale up.[^3_1]
- Early evaluations and community reports on Gemma 3 indicate similar issues, including users noticing substantial hallucinations and inaccuracies even with the 12B multimodal model, especially when interpreting images.[^3_2][^3_3][^3_4]

For PDF→Markdown, the critical failure modes are exactly: numbers, tables, headings, and “fill in missing bits.” That’s where Gemma seems relatively weak compared to the best small SLMs.

## Why I biased toward Phi‑3 / Llama

- Phi‑3 Mini was explicitly optimized as a small, instruction‑following model with strong performance on code/format tasks, which are close to “transform this text exactly without adding content.”[^3_5]
- Llama 3.2 3B has been used in RAG and extraction setups where low hallucination on grounded text is a design goal; its model card and ecosystem emphasize instruction‑following and factuality for small sizes.[^3_6][^3_7][^3_8]

That doesn’t mean Gemma‑3B is unusable; it just means that if your priority is “do not invent anything when re‑emitting structured text,” the available data nudges me toward Phi‑3 Mini or Llama 3.2‑3B before a Gemma of similar size.

If you specifically want to try **Gemma 3B** for this, the safest pattern is still: use a deterministic PDF text extractor, then prompt Gemma with very tight “copy‑edit only” instructions and add automatic checks (e.g., token counts per block) to catch drift.
<span style="display:none">[^3_10][^3_11][^3_12][^3_13][^3_14][^3_15][^3_16][^3_17][^3_18][^3_19][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://arxiv.org/html/2509.09715v1

[^3_2]: https://www.reddit.com/r/LocalLLaMA/comments/1k55eeo/gemma312b_hallucinating_when_reading_images/

[^3_3]: https://www.reddit.com/r/LocalLLaMA/comments/1mlg0sk/is_anything_better_than_gemma327b_for_handwritten/

[^3_4]: https://promptfoo.dev/models/reports/gemma-3-27b

[^3_5]: https://arxiv.org/pdf/2404.14219.pdf

[^3_6]: https://haystack.deepset.ai/cookbook/llama32_agentic_rag

[^3_7]: https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct

[^3_8]: https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_2/

[^3_9]: https://github.com/vectara/hallucination-leaderboard

[^3_10]: https://arxiv.org/html/2503.19786v1

[^3_11]: https://ai.google.dev/gemma/docs/core

[^3_12]: https://www.linkedin.com/posts/mrdbourke_gemma-3-270m-may-be-my-favourite-open-source-activity-7373601115210207232-gcr7

[^3_13]: https://thezvi.substack.com/p/gemini-3-model-card-and-safety-framework

[^3_14]: https://developers.googleblog.com/gemma-explained-whats-new-in-gemma-3/

[^3_15]: https://venturebeat.com/ai/developers-beware-googles-gemma-model-controversy-exposes-model-lifecycle

[^3_16]: https://huggingface.co/blog/gemma3

[^3_17]: https://www.youtube.com/watch?v=U8qt5IB__5c

[^3_18]: https://opencv.org/gemma-3/

[^3_19]: https://huggingface.co/google/gemma-3-1b-it

