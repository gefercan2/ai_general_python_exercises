# DeepSeek R1 Local Setup Guide
### For Linux Mint | GTX 850M | Python 3.12 | Low VRAM / CPU-first

---

## 🧠 About This Guide

This guide walks you through setting up and running **DeepSeek R1 Distill (1.5B)** locally on a machine with limited VRAM (2–4GB). We use the **1.5B distilled version**, which:

- Weighs ~900MB at 4-bit quantization
- Runs on CPU + system RAM if GPU fails
- Specialises in **reasoning, logic, and math**
- Is based on Qwen2.5 architecture (very efficient)

We cover **two approaches**:
1. ✅ **Terminal** — quick test via command line
2. ✅ **Jupyter Notebook** — full interactive workflow with fine-tuning

---

## ⚠️ Hardware Reality Check

| Component | Your Spec | Impact |
|---|---|---|
| GPU | GTX 850M (2–4GB VRAM, CUDA 5.0) | Old — GPU acceleration may not work |
| CPU | Intel i5/i7 (Haswell era) | Will carry most of the workload |
| RAM | 8GB+ system RAM recommended | Model loads here if GPU fails |
| OS | Linux Mint | Fully supported ✅ |

> **Bottom line:** Expect CPU-based inference. It's slower (a few seconds per response) but works perfectly fine for experimentation and fine-tuning.

---

## PART 1 — Terminal Setup

### Step 1: Open Terminal

Press `Ctrl + Alt + T` or open it from your Linux Mint menu.

---

### Step 2: Check Your Python Version

```bash
python3 --version
```

Expected output: `Python 3.12.x`

---

### Step 3: Create a Virtual Environment

```bash
# Navigate to your home directory (or wherever you want the project)
cd ~

# Create the virtual environment
python3 -m venv deepseek_env

# Activate it
source deepseek_env/bin/activate
```

You should now see `(deepseek_env)` at the start of your terminal prompt.

---

### Step 4: Upgrade pip and Install Dependencies

```bash
pip install --upgrade pip

pip install transformers accelerate bitsandbytes
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
```

> **Note:** We install the CPU-only version of PyTorch. If you want to try GPU support (it may or may not work on the 850M), replace the last line with:
> ```bash
> pip install torch torchvision torchaudio
> ```
> Then test with `python3 -c "import torch; print(torch.cuda.is_available())"`. If it prints `False`, stick with the CPU version.

---

### Step 5: Quick Inference Test via Terminal

Create a test script:

```bash
nano test_deepseek.py
```

Paste the following code:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_name = "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_name)

print("Loading model (this may take a few minutes on first run)...")
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float32,   # Use float32 for CPU stability
    device_map="cpu"             # Force CPU
)

model.eval()

prompt = "What is the square root of 144? Explain your reasoning step by step."
inputs = tokenizer(prompt, return_tensors="pt")

print("\nGenerating response...\n")
with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=300,
        temperature=0.7,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id
    )

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print("=" * 60)
print(response)
print("=" * 60)
```

Save with `Ctrl + O`, then `Enter`, then exit with `Ctrl + X`.

Run it:

```bash
python3 test_deepseek.py
```

> **First run:** The model (~900MB–3GB depending on precision) will download from HuggingFace. This only happens once. Subsequent runs load from cache.

> **Expected speed:** 1–5 tokens/second on CPU. Slow, but working!

---

### Step 6: Interactive Chat Loop (Terminal)

For an ongoing conversation in the terminal, create a chat script:

```bash
nano chat_deepseek.py
```

Paste:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_name = "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float32,
    device_map="cpu"
)
model.eval()

print("\n🤖 DeepSeek R1 Chat — type 'quit' to exit\n")

while True:
    user_input = input("You: ").strip()
    if user_input.lower() in ["quit", "exit", "q"]:
        print("Goodbye!")
        break
    if not user_input:
        continue

    inputs = tokenizer(user_input, return_tensors="pt")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=200,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    # Strip the prompt from the response
    response = response[len(user_input):].strip()
    print(f"\nDeepSeek: {response}\n")
```

Save and run:

```bash
python3 chat_deepseek.py
```

---

### Step 7: Deactivating When Done

```bash
deactivate
```

---

## PART 2 — Jupyter Notebook Setup

### Step 1: Install Jupyter (if not already installed)

Make sure your virtual environment is active first:

```bash
source ~/deepseek_env/bin/activate
pip install jupyter notebook ipywidgets
```

---

### Step 2: Register the Environment as a Jupyter Kernel

This makes sure Jupyter uses your virtual environment:

```bash
pip install ipykernel
python3 -m ipykernel install --user --name=deepseek_env --display-name "DeepSeek (Python 3.12)"
```

---

### Step 3: Launch Jupyter Notebook

```bash
jupyter notebook
```

Your browser will open automatically. If it doesn't, copy the URL from the terminal (starts with `http://localhost:8888/?token=...`) and paste it into your browser.

---

### Step 4: Create a New Notebook

In the Jupyter file browser:
1. Click **New** (top right)
2. Select **DeepSeek (Python 3.12)** from the dropdown

---

### Step 5: Cell 1 — Install / Verify Libraries

```python
# Run this cell once to confirm everything is installed
import subprocess
import sys

packages = ["transformers", "accelerate", "bitsandbytes", "peft", "datasets", "trl"]
for pkg in packages:
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

print("✅ All packages ready!")
```

---

### Step 6: Cell 2 — Load the Model

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_name = "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_name)

print("Loading model... (first run downloads ~900MB)")
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float32,   # Safe for CPU
    device_map="cpu"
)

model.eval()
print("✅ Model loaded and ready!")
```

> **Tip:** If you have more than 8GB RAM and want to try 4-bit quantization for speed:
> ```python
> model = AutoModelForCausalLM.from_pretrained(
>     model_name,
>     load_in_4bit=True,
>     device_map="auto"
> )
> ```

---

### Step 7: Cell 3 — Test Inference

A
test inference for a Large Language Model (LLM) is the process of running a trained or fine-tuned model on new, unseen data to evaluate its performance, accuracy, and efficiency before deploying it in a production environment. 
It is essentially the "testing" phase of the inference pipeline—where the model applies its learned patterns to user-provided prompts to generate answers, code, or summaries, but without updating its parameters.

```python
def ask_deepseek(question, max_tokens=300):
    inputs = tokenizer(question, return_tensors="pt")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return response[len(question):].strip()

# Test it
answer = ask_deepseek("Explain what a neural network is in simple terms.")
print(answer)
```

---

### Step 8: Cell 4 — LoRA Fine-Tuning Setup
a
LoRA (Low-Rank Adaptation) is a lightweight, specialized plugin or "patch" used to fine-tune large machine learning models (like Stable Diffusion or LLMs) without needing to retrain the entire model. It operates as a small modification file (typically 50MB–300MB) that adds specific styles, characters, or concepts to a base model, enhancing consistency and specificity.

Install fine-tuning dependencies:

```python
# Install PEFT for LoRA
import subprocess
subprocess.check_call(["pip", "install", "peft", "trl", "datasets", "-q"])
print("✅ Fine-tuning libraries ready!")
```

---

### Step 9: Cell 5 — Prepare a Small Dataset

```python
from datasets import Dataset

# Example: small reasoning dataset
# Replace with your own examples!
data = [
    {
        "instruction": "What is 15% of 200?",
        "output": "15% of 200 is 30. To calculate: 200 × 0.15 = 30."
    },
    {
        "instruction": "If a train travels at 60 km/h for 2 hours, how far does it go?",
        "output": "Distance = Speed × Time = 60 × 2 = 120 km."
    },
    {
        "instruction": "What is the capital of France?",
        "output": "The capital of France is Paris."
    },
    {
        "instruction": "Explain what RAM is in one sentence.",
        "output": "RAM (Random Access Memory) is temporary memory your computer uses to store data it is actively working with."
    },
    {
        "instruction": "What is Linux Mint?",
        "output": "Linux Mint is a free, user-friendly operating system based on Ubuntu, popular for its ease of use and stability."
    },
]

dataset = Dataset.from_list(data)
print(f"✅ Dataset loaded: {len(dataset)} examples")
```

---

### Step 10: Cell 6 — Apply LoRA and Fine-Tune

```python
from peft import get_peft_model, LoraConfig, TaskType
from transformers import TrainingArguments, Trainer

# Configure LoRA — keep r small to save memory
lora_config = LoraConfig(
    r=4,                          # Very low rank = less memory
    lora_alpha=8,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type=TaskType.CAUSAL_LM
)

# Apply LoRA to the model
peft_model = get_peft_model(model, lora_config)
peft_model.print_trainable_parameters()
# Expected: trainable params ~0.1% of total — very efficient!

# Tokenize the dataset
def tokenize(example):
    text = example["instruction"] + "\n" + example["output"]
    tokens = tokenizer(
        text,
        truncation=True,
        max_length=128,          # Short sequences = less memory
        padding="max_length"
    )
    tokens["labels"] = tokens["input_ids"].copy()
    return tokens

tokenized_dataset = dataset.map(tokenize, remove_columns=dataset.column_names)

# Training configuration — optimised for low memory
training_args = TrainingArguments(
    output_dir="./deepseek-finetuned",
    per_device_train_batch_size=1,       # Smallest possible batch
    gradient_accumulation_steps=4,       # Simulates batch of 4
    num_train_epochs=3,
    learning_rate=2e-4,
    fp16=False,                          # Keep False for CPU stability
    logging_steps=5,
    save_strategy="epoch",
    no_cuda=True,                        # Force CPU
    report_to="none"                     # Disable WandB etc.
)

trainer = Trainer(
    model=peft_model,
    args=training_args,
    train_dataset=tokenized_dataset,
)

print("🚀 Starting fine-tuning... (this will take a while on CPU)")
trainer.train()
print("✅ Fine-tuning complete!")
```

> ⏱️ **Time estimate:** With 5 examples and 3 epochs, expect **15–60 minutes** on CPU. Leave it running!

---

### Step 11: Cell 7 — Save Your Fine-Tuned Model

```python
# Save the LoRA adapter (not the full model — much smaller!)
peft_model.save_pretrained("./my-deepseek-lora")
tokenizer.save_pretrained("./my-deepseek-lora")

print("✅ Model saved to ./my-deepseek-lora")
print("You can reload it anytime without retraining.")
```

---

### Step 12: Cell 8 — Reload and Chat With Your Fine-Tuned Model

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

# Load base model
base_model = AutoModelForCausalLM.from_pretrained(
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
    torch_dtype=torch.float32,
    device_map="cpu"
)

# Load your LoRA adapter on top
my_model = PeftModel.from_pretrained(base_model, "./my-deepseek-lora")
my_model.eval()

tokenizer = AutoTokenizer.from_pretrained("./my-deepseek-lora")

# Chat function
def chat(question):
    inputs = tokenizer(question, return_tensors="pt")
    with torch.no_grad():
        outputs = my_model.generate(
            **inputs,
            max_new_tokens=200,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return response[len(question):].strip()

# Try it!
print(chat("What is 15% of 200?"))
```

---

## 🔁 Resuming Your Work (Every Session)

Every time you come back to this project, run these steps in the terminal:

```bash
# 1. Activate the virtual environment
source ~/deepseek_env/bin/activate

# 2. Launch Jupyter
jupyter notebook

# 3. Open your notebook in the browser and re-run the cells
```

> The model weights are cached locally after the first download. They will **not** be re-downloaded.

---

## 🛑 Ending Your Session

```bash
# In the terminal where Jupyter is running:
Ctrl + C

# Then deactivate the environment:
deactivate
```

---

## 🧠 Quick Reference Cheat Sheet

| Task | Command |
|---|---|
| Activate environment | `source ~/deepseek_env/bin/activate` |
| Start Jupyter | `jupyter notebook` |
| Run terminal chat | `python3 chat_deepseek.py` |
| Stop Jupyter | `Ctrl + C` in terminal |
| Deactivate environment | `deactivate` |

---

## 💡 Troubleshooting

| Problem | Fix |
|---|---|
| `CUDA not available` | Normal — just use `device_map="cpu"` |
| `Out of memory` | Reduce `max_length` to 64, set `per_device_train_batch_size=1` |
| `bitsandbytes error` | Remove `load_in_4bit=True`, use `torch.float32` instead |
| Model download stuck | Check internet, try again — HuggingFace servers can be slow |
| Kernel not found in Jupyter | Re-run the ipykernel install command in Step 2 of Part 2 |
| Very slow inference | Normal on CPU — DeepSeek R1 thinks through problems step-by-step |

---

## 📌 Other Models You Can Swap In

The same code works with these models — just change `model_name`:

| Model | Strength | Size (4-bit) |
|---|---|---|
| `HuggingFaceTB/SmolLM2-1.7B-Instruct` | Speed, general chat | ~1GB |
| `Qwen/Qwen2.5-1.5B-Instruct` | Code, multilingual | ~900MB |
| `google/gemma-3-1b-it` | Long documents (128K context) | ~600MB |
| `microsoft/Phi-3-mini-4k-instruct` | Reasoning | ~2GB |
| `TinyLlama/TinyLlama-1.1B-Chat-v1.0` | Fastest, most lightweight | ~760MB |

---

*Guide written for Linux Mint | GTX 850M | Python 3.12 | March 2026*
