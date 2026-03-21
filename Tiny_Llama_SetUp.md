# 🤖 Local LLM Setup Guide on Linux Mint
### GTX 850M · Python 3.12 · Jupyter Notebook · Low VRAM / CPU-first Workflow

---

## 📋 Table of Contents

1. [Hardware Reality Check](#1-hardware-reality-check)
2. [Project Folder Setup](#2-project-folder-setup)
3. [Virtual Environment — Common Problem & Fix](#3-virtual-environment--common-problem--fix)
4. [Installing Dependencies](#4-installing-dependencies)
5. [Launching Jupyter Notebook](#5-launching-jupyter-notebook)
6. [Code Walkthrough — Loading & Running a Model](#6-code-walkthrough--loading--running-a-model)
7. [Code Walkthrough — Fine-Tuning with LoRA](#7-code-walkthrough--fine-tuning-with-lora)
8. [Code Walkthrough — Saving & Chatting with Your Model](#8-code-walkthrough--saving--chatting-with-your-model)
9. [Compatible Models for Your Hardware](#9-compatible-models-for-your-hardware)
10. [Daily Workflow Cheat Sheet](#10-daily-workflow-cheat-sheet)

---

## 1. Hardware Reality Check

The **NVIDIA GeForce GTX 850M** is a Maxwell-architecture GPU from 2014. Before diving in, it is important to understand its limitations for AI workloads:

| Spec | Value |
|---|---|
| VRAM | 2GB or 4GB GDDR5 |
| CUDA Compute Capability | 5.0 |
| Architecture | Maxwell (GM107) |

**What this means in practice:**

- Modern PyTorch versions have partially dropped support for CUDA Compute Capability 5.0, so GPU-accelerated training **may not work** reliably.
- The GPU is useful for **inference** (running a model to get answers) on very small quantized models.
- **Fine-tuning (LoRA training) will run on the CPU** using your system RAM. This is slower but fully functional.
- Stick to models **under 2 billion parameters** for a smooth experience. Models between 1–3B work if you have 8GB+ of system RAM.

> ✅ **Good news:** Everything in this guide is designed to work within these constraints. You will have a real, running local LLM by the end.

---

## 2. Project Folder Setup

Open a terminal (`Ctrl+Alt+T` or from the Linux Mint menu) and run the following commands **in order**. This creates a clean, well-organised project structure.

```bash
# Step 1: Go to your home directory
cd ~

# Step 2: Create a dedicated project folder
mkdir my_llm_project

# Step 3: Enter the project folder
cd my_llm_project
```

> 💡 **Why this matters:** Keeping your project in a dedicated folder avoids the common confusion of being *inside* the virtual environment folder when you try to activate it (see Section 3 for details on this exact problem).

---

## 3. Virtual Environment — Common Problem & Fix

### What is a virtual environment?

A virtual environment is an isolated Python installation that keeps your LLM libraries separate from your system Python. This prevents version conflicts with other software on your machine.

### Creating the virtual environment

Run this from inside your `my_llm_project` folder:

```bash
python3 -m venv llm_env
```

This creates a subfolder called `llm_env/` inside `my_llm_project/`. Your folder structure now looks like:

```
my_llm_project/
└── llm_env/
    ├── bin/
    ├── lib/
    └── pyvenv.cfg
```

### ⚠️ The Most Common Problem: "No such file or directory"

Many users run into this error when trying to activate the environment:

```bash
# ❌ This fails if you are already INSIDE the llm_env folder
source llm_env/bin/activate
# Error: No such file or directory
```

**Why does this happen?**

If your terminal prompt shows you are already *inside* `llm_env/` as your working directory (check with `pwd`), then there is no *second* `llm_env/` folder inside it — so the path `llm_env/bin/activate` does not exist.

**How to diagnose:**

```bash
# Run this to see where you are
pwd

# Run this to see what files are in the current folder
ls
```

**The fix depends on what `ls` shows you:**

**Scenario A** — `ls` shows `bin`, `lib`, `pyvenv.cfg`
You are *inside* the virtual environment folder. Activate it directly:
```bash
source bin/activate
```

**Scenario B** — `ls` shows your project files or nothing special
You are in the right place but the environment may not exist yet. Create and activate it:
```bash
python3 -m venv llm_env
source llm_env/bin/activate
```

**Scenario C** — The cleanest approach (recommended)
Always navigate from your home directory to be sure:
```bash
cd ~
cd my_llm_project
source llm_env/bin/activate
```

### How to confirm activation worked

Once activated, your terminal prompt will change to show `(llm_env)` at the start:

```
(llm_env) yourname@machine:~/my_llm_project$
```

If you do not see `(llm_env)`, the environment is **not** active and library installations or Jupyter will not work correctly.

---

## 4. Installing Dependencies

With the virtual environment active (you should see `(llm_env)` in your prompt), install all required libraries:

```bash
# Step 1: Upgrade pip first (avoids many install errors)
pip install --upgrade pip

# Step 2: Install the core AI libraries
pip install transformers datasets peft accelerate trl

# Step 3: Install bitsandbytes for 4-bit quantization
pip install bitsandbytes --prefer-binary

# Step 4: Install Jupyter and HuggingFace tools
pip install jupyter notebook huggingface_hub
```

### What each library does

| Library | Purpose |
|---|---|
| `transformers` | Loads and runs pre-trained models from HuggingFace |
| `datasets` | Loads and processes training datasets |
| `peft` | Enables LoRA fine-tuning (parameter-efficient training) |
| `accelerate` | Helps PyTorch run efficiently on your hardware |
| `trl` | Training tools for language models (reward learning, SFT) |
| `bitsandbytes` | Enables 4-bit and 8-bit quantization to reduce memory usage |
| `jupyter notebook` | The interactive coding environment we use for all experiments |
| `huggingface_hub` | Downloads models and datasets from HuggingFace |

### ⚠️ If bitsandbytes fails

On older CUDA hardware like the GTX 850M, `bitsandbytes` may give errors. If so, you can still run models — just skip 4-bit loading and use full precision on CPU instead. The code sections below show both options.

---

## 5. Launching Jupyter Notebook

Each time you want to work on your project, follow these steps:

```bash
# Step 1: Go to your project folder
cd ~/my_llm_project

# Step 2: Activate the virtual environment
source llm_env/bin/activate

# Step 3: Start Jupyter
jupyter notebook
```

Jupyter will open automatically in your browser. If it does not, look in the terminal output for a line like:

```
http://localhost:8888/?token=abc123...
```

Copy and paste that URL into your browser manually.

To create a new notebook: click **New → Python 3 (ipykernel)** in the top right of the Jupyter interface.

---

## 6. Code Walkthrough — Loading & Running a Model

Create a new notebook and enter the following code blocks, one per cell. Run each cell with `Shift+Enter`.

---

### Cell 1 — Import libraries

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
```

**What this does:**
- `AutoModelForCausalLM` — automatically loads the right model class for text generation, no matter which model family you choose.
- `AutoTokenizer` — loads the matching tokenizer, which converts your text into numbers the model understands.
- `torch` — PyTorch, the deep learning framework everything is built on.

---

### Cell 2 — Choose your model and load it

```python
# Change this line to switch to a different model (see Section 9)
model_name = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"

# Load the tokenizer
tokenizer = AutoTokenizer.from_pretrained(model_name)

# Load the model in 4-bit quantization to save memory
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    load_in_4bit=True,       # Reduces model size to ~760MB
    device_map="auto",       # Automatically uses GPU if available, falls back to CPU
    torch_dtype=torch.float16
)
```

**What each argument does:**
- `model_name` — the HuggingFace model identifier. This is the only line you need to change to try different models.
- `load_in_4bit=True` — compresses the model weights from 16-bit to 4-bit, reducing memory usage by roughly 75%.
- `device_map="auto"` — lets PyTorch automatically decide whether to load the model on the GPU or CPU based on available memory.
- `torch_dtype=torch.float16` — uses half-precision floating point to further reduce memory.

> 💡 **If you get a CUDA or bitsandbytes error**, replace the `from_pretrained` call with this simpler CPU version:
> ```python
> model = AutoModelForCausalLM.from_pretrained(
>     model_name,
>     torch_dtype=torch.float32   # Full precision, no quantization
> )
> ```

---

### Cell 3 — Run your first inference

```python
# Format the prompt using TinyLlama's chat template
prompt = "<|system|>You are a helpful assistant.</s><|user|>What is Linux Mint?</s><|assistant|>"

# Tokenize: convert the text prompt into numbers
inputs = tokenizer(prompt, return_tensors="pt")

# Generate: run the model to produce a response
outputs = model.generate(
    **inputs,
    max_new_tokens=200,    # Maximum number of words to generate
    temperature=0.7,       # Controls creativity: 0=focused, 1=creative
    do_sample=True         # Enables temperature-based sampling
)

# Decode: convert the output numbers back into readable text
response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(response)
```

**What each step does:**
- **Tokenize** — the model cannot read text directly. The tokenizer splits your sentence into tokens (roughly words or word-pieces) and converts them to integer IDs.
- `return_tensors="pt"` — returns PyTorch tensors, the format the model expects.
- **Generate** — the model predicts the next token repeatedly until it reaches `max_new_tokens` or a stop signal.
- `temperature=0.7` — lower values (e.g. 0.2) make responses more predictable and factual; higher values (e.g. 0.9) make them more varied and creative.
- **Decode** — converts the output token IDs back into human-readable text. `skip_special_tokens=True` removes formatting tags like `<|assistant|>`.

---

## 7. Code Walkthrough — Fine-Tuning with LoRA

Fine-tuning teaches the model new behaviour using your own data. LoRA (Low-Rank Adaptation) does this efficiently by only updating a tiny fraction of the model's weights (~0.1%) instead of all of them.

---

### Cell 4 — Prepare your training data

Create a file called `data.json` in your project folder with this format:

```json
[
  {
    "instruction": "What is Linux Mint?",
    "output": "Linux Mint is a free, open-source operating system based on Ubuntu, designed to be easy to use and elegant."
  },
  {
    "instruction": "Explain what RAM does",
    "output": "RAM (Random Access Memory) is your computer's short-term memory. It holds data that your CPU is actively using."
  }
]
```

Then load it in a notebook cell:

```python
from datasets import Dataset
import json

# Load your custom data file
with open("data.json") as f:
    raw_data = json.load(f)

# Convert to HuggingFace Dataset format
dataset = Dataset.from_list(raw_data)

print(f"Loaded {len(dataset)} training examples")
```

**What this does:**
- `json.load(f)` — reads your training examples into a Python list of dictionaries.
- `Dataset.from_list()` — wraps them in HuggingFace's Dataset class, which handles batching, shuffling, and tokenization efficiently.

---

### Cell 5 — Configure LoRA

```python
from peft import get_peft_model, LoraConfig, TaskType

# Define the LoRA configuration
lora_config = LoraConfig(
    r=8,                        # Rank: how many parameters LoRA adds (lower = less memory)
    lora_alpha=16,              # Scaling factor: how strongly LoRA influences the model
    target_modules=["q_proj", "v_proj"],  # Which layers to apply LoRA to
    lora_dropout=0.05,          # Randomly drops connections during training to prevent overfitting
    bias="none",                # Do not add bias terms
    task_type=TaskType.CAUSAL_LM  # Tell LoRA this is a text generation task
)

# Apply LoRA to the model
model = get_peft_model(model, lora_config)

# Print how many parameters are actually being trained
model.print_trainable_parameters()
# Expected output: trainable params: ~1,000,000 || all params: ~1,100,000,000 || trainable: ~0.1%
```

**What each parameter means:**
- `r=8` — the "rank" of the LoRA matrices. Rank 8 means LoRA adds two small matrices of rank 8 into each targeted layer. Lower rank = less memory and faster training but less capacity to learn. For your hardware, keep this at 8 or below.
- `lora_alpha=16` — a scaling factor. A common rule is to set it to `2 × r`. It controls how much the LoRA updates actually affect the model.
- `target_modules` — LoRA is only applied to the attention projection layers (`q_proj` = query, `v_proj` = value). These are the most impactful layers to fine-tune for behaviour changes.
- `lora_dropout=0.05` — randomly sets 5% of LoRA connections to zero during each training step. This prevents the model from memorising the training data too literally (overfitting).

---

### Cell 6 — Tokenize the dataset

```python
def tokenize_example(example):
    # Combine instruction and output into a single training text
    text = example["instruction"] + " " + example["output"]
    return tokenizer(
        text,
        truncation=True,      # Cut off text longer than max_length
        max_length=256,       # Maximum token length per example
        padding="max_length"  # Pad shorter examples to the same length
    )

# Apply tokenization to every example in the dataset
tokenized_dataset = dataset.map(tokenize_example)

print("Tokenization complete.")
print(f"Sample token count: {len(tokenized_dataset[0]['input_ids'])}")
```

**What this does:**
- `truncation=True` — any text longer than `max_length` tokens is cut off. This is important for memory management on low-RAM hardware.
- `max_length=256` — keep this low (128–256) on your machine to avoid running out of memory during training.
- `padding="max_length"` — all examples are padded to the same length so they can be batched together efficiently.

---

### Cell 7 — Run the training

```python
from transformers import TrainingArguments, Trainer

# Define training hyperparameters
training_args = TrainingArguments(
    output_dir="./tinyllama-finetuned",   # Where to save checkpoints
    per_device_train_batch_size=1,        # Process 1 example at a time (low memory)
    gradient_accumulation_steps=4,        # Simulate a batch size of 4 without extra memory
    num_train_epochs=3,                   # Go through the full dataset 3 times
    learning_rate=2e-4,                   # How fast to update weights (2e-4 = 0.0002)
    fp16=False,                           # Set True only if GPU CUDA is working
    logging_steps=10,                     # Print a loss update every 10 steps
    save_strategy="epoch",                # Save a checkpoint after each epoch
    no_cuda=True,                         # Force CPU training (safe for GTX 850M)
)

# Create the Trainer object
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
)

# Start training — this may take several hours on CPU
print("Starting training... (grab a coffee ☕)")
trainer.train()
print("Training complete!")
```

**What each argument does:**
- `per_device_train_batch_size=1` — only 1 example loaded at a time. This is the lowest possible batch size, essential for your hardware.
- `gradient_accumulation_steps=4` — instead of updating the model weights after every single example, gradients are accumulated over 4 steps and then applied together. This simulates a batch of 4 without needing 4 examples in memory simultaneously.
- `num_train_epochs=3` — the trainer will loop through your entire dataset 3 times. More epochs = more learning but also more risk of overfitting.
- `learning_rate=2e-4` — controls how big each weight update is. Too high and training becomes unstable; too low and learning is extremely slow.
- `no_cuda=True` — forces training on CPU. Remove this line if your CUDA setup works correctly.

> ⏱️ **Time expectation:** On CPU with 100 training examples, expect 2–8 hours per epoch. You can safely close the browser tab and let the terminal run overnight. The checkpoints are saved automatically.

---

## 8. Code Walkthrough — Saving & Chatting with Your Model

---

### Cell 8 — Save your fine-tuned model

```python
# Save the LoRA adapter weights (small file, not the full model)
model.save_pretrained("./my-tinyllama-lora")
tokenizer.save_pretrained("./my-tinyllama-lora")

print("Model saved to ./my-tinyllama-lora")
```

**What gets saved:**
The LoRA adapter is a small set of additional weights (typically a few MB) that sit on top of the base model. You only save and load these small files — the base model is re-downloaded from HuggingFace each time (or cached locally in `~/.cache/huggingface/`).

---

### Cell 9 — Load your fine-tuned model and chat

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch

# Load the original base model
base_model = AutoModelForCausalLM.from_pretrained(
    "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    torch_dtype=torch.float32
)

# Load and attach your LoRA adapter on top
model = PeftModel.from_pretrained(base_model, "./my-tinyllama-lora")
model.eval()  # Set to evaluation mode (disables dropout, speeds up inference)

# Load the tokenizer
tokenizer = AutoTokenizer.from_pretrained("./my-tinyllama-lora")

print("Your fine-tuned model is ready!")
```

---

### Cell 10 — Interactive chat loop

```python
print("Chat with your model (type 'quit' to exit)\n")

while True:
    # Get user input
    user_input = input("You: ")

    # Exit condition
    if user_input.lower() in ["quit", "exit", "q"]:
        print("Goodbye!")
        break

    # Format the prompt
    prompt = f"<|system|>You are a helpful assistant.</s><|user|>{user_input}</s><|assistant|>"

    # Tokenize
    inputs = tokenizer(prompt, return_tensors="pt")

    # Generate response (no gradient calculation needed for inference)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=150,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id  # Prevents warning about padding
        )

    # Decode and print only the assistant's reply
    full_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    # Extract just the answer after the last <|assistant|> marker
    reply = full_text.split("assistant")[-1].strip()
    print(f"Bot: {reply}\n")
```

**Key additions explained:**
- `model.eval()` — switches the model to evaluation mode. During training, dropout randomly disables neurons to prevent overfitting. In eval mode, all neurons are active, giving consistent and faster responses.
- `torch.no_grad()` — tells PyTorch not to calculate or store gradients during this forward pass. Gradients are only needed for training. This saves significant memory and speeds up inference.
- `pad_token_id=tokenizer.eos_token_id` — by default TinyLlama does not have a separate padding token, so we reuse the end-of-sequence token. Without this you get a warning every generation.

---

## 9. Compatible Models for Your Hardware

All models below work with the **same code** — just change the `model_name` variable in Cell 2.

### 🟢 Best fits (under 1B — fast, minimal RAM)

| Model | HuggingFace ID | Size (4-bit) | Best for |
|---|---|---|---|
| SmolLM2-135M | `HuggingFaceTB/SmolLM2-135M-Instruct` | ~100MB | Ultra-fast, basic tasks |
| SmolLM2-360M | `HuggingFaceTB/SmolLM2-360M-Instruct` | ~250MB | Fast chat, Q&A |
| Qwen3.5-0.8B | `Qwen/Qwen3.5-0.8B-Instruct` | ~500MB | Multilingual, long context |
| Gemma-3-1B | `google/gemma-3-1b-it` | ~600MB | Long documents (128K context) |
| Llama-3.2-1B | `meta-llama/Llama-3.2-1B-Instruct` | ~600MB | General, most tutorials |

### 🟡 Good fits (1–2B — better quality, needs 8GB+ RAM)

| Model | HuggingFace ID | Size (4-bit) | Best for |
|---|---|---|---|
| TinyLlama-1.1B | `TinyLlama/TinyLlama-1.1B-Chat-v1.0` | ~760MB | All-round starter model |
| DeepSeek-R1-1.5B | `deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B` | ~900MB | Reasoning and math |
| Qwen2.5-1.5B | `Qwen/Qwen2.5-1.5B-Instruct` | ~900MB | Code, structured output |
| SmolLM2-1.7B | `HuggingFaceTB/SmolLM2-1.7B-Instruct` | ~1GB | Best quality under 2B |
| Qwen3-1.7B | `Qwen/Qwen3-1.7B-Instruct` | ~1GB | Multilingual, general chat |

### 🔴 Stretch goals (3B — very slow on CPU, needs 16GB+ RAM)

| Model | HuggingFace ID | Notes |
|---|---|---|
| Phi-3-mini | `microsoft/Phi-3-mini-4k-instruct` | Strong reasoning but ~2GB |
| Llama-3.2-3B | `meta-llama/Llama-3.2-3B-Instruct` | Best quality but very slow on CPU |

> ⚠️ **Do not attempt 7B models** on this hardware. They will either crash or be too slow to be useful (potentially hours per response on CPU).

---

## 10. Daily Workflow Cheat Sheet

### Every time you open a new terminal session:

```bash
# 1. Go to your project
cd ~/my_llm_project

# 2. Activate the environment (look for (llm_env) in your prompt)
source llm_env/bin/activate

# 3. Launch Jupyter
jupyter notebook
```

### When you are done:

```bash
# Stop Jupyter (in the terminal where it is running)
Ctrl+C

# Deactivate the virtual environment
deactivate
```

### Quick troubleshooting reference

| Problem | Cause | Fix |
|---|---|---|
| `source llm_env/bin/activate` fails | You are inside the `llm_env` folder | Run `source bin/activate` instead |
| `(llm_env)` not showing in prompt | Environment not activated | Re-run `source llm_env/bin/activate` |
| `jupyter: command not found` | Environment not activated | Activate first, then run jupyter |
| CUDA errors during training | GTX 850M compatibility | Add `no_cuda=True` to TrainingArguments |
| Out of memory error | Model too large | Use a smaller model or add `load_in_4bit=True` |
| Model download fails | No internet / HuggingFace auth | Check connection; run `huggingface-cli login` for gated models |
| Training is very slow | Running on CPU | Normal — leave it overnight |

---

*Guide covers: Linux Mint · Python 3.12 · PyTorch · HuggingFace Transformers · PEFT LoRA · Jupyter Notebook · GTX 850M / low-VRAM hardware*
