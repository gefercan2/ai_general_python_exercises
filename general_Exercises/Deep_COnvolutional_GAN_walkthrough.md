# Building a Minimal GAN 
##### on Linux Mint with an NVIDIA GTX 850M

### A Step-by-Step Walkthrough for Python 3.12 + Jupyter Notebook

---

## Table of Contents
1. [What is a GAN?](#what-is-a-gan)
2. [Why This Setup?](#why-this-setup)
3. [Environment Setup](#environment-setup)
4. [Project Structure](#project-structure)
5. [The Code — Step by Step](#the-code--step-by-step)
   - [Cell 1: Imports & Config](#cell-1-imports--config)
   - [Cell 2: Load MNIST Data](#cell-2-load-mnist-data)
   - [Cell 3: Generator](#cell-3-generator)
   - [Cell 4: Discriminator](#cell-4-discriminator)
   - [Cell 5: Training Loop](#cell-5-training-loop)
   - [Cell 6: View Generated Images](#cell-6-view-generated-images)
6. [Common Errors & Fixes](#common-errors--fixes)
7. [Training Schedule](#training-schedule)
8. [Next Steps](#next-steps)

---

## What is a GAN?

A **Generative Adversarial Network (GAN)** consists of two neural networks competing against each other:

- **Generator (G)** — Takes random noise as input and tries to produce realistic-looking images.
- **Discriminator (D)** — Looks at images and tries to tell the difference between real ones (from the dataset) and fake ones (from G).

They train together in a loop:
- G gets better at fooling D.
- D gets better at catching G.
- Over time, G learns to produce convincing images.

```
Random Noise (z) --> [ Generator ] --> Fake Image
                                            |
Real Images --------------------------------+
                                            |
                                     [ Discriminator ]
                                            |
                                    Real or Fake?
```

---

## Why This Setup?

| Choice | Reason |
|--------|--------|
| **Vanilla GAN on MNIST** | MNIST (28×28 grayscale digits) is tiny — perfect for a 2GB VRAM GPU |
| **Linear layers (no convolutions)** | Simpler architecture, less memory, faster to debug |
| **GTX 850M** | Supports CUDA 11.x, enough for small experiments |
| **Python 3.12 + PyTorch** | Modern, well-supported stack |

---

## Environment Setup

### Step 1 — Verify Python and PyTorch

Open a terminal and run:

```bash
python3 --version
# Expected: Python 3.12.x

python3 -c "import torch; print(torch.__version__)"
# Expected: 2.x.x+cu118 (or similar)

python3 -c "import torch; print(torch.cuda.is_available())"
# Expected: True
```

> **If the last command prints `False`**, your PyTorch was installed without CUDA support. Fix it with:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

The GTX 850M supports **CUDA 11.x**, so `cu118` is the right build.

### Step 2 — Install Dependencies

```bash
pip install torchvision matplotlib notebook
```

### Step 3 — Monitor GPU Usage (Optional but Recommended)

Open a second terminal and run this to watch your GPU memory live:

```bash
watch -n 1 nvidia-smi
```

### Step 4 — Launch Jupyter

```bash
jupyter notebook
```

Create a new notebook and name it `dcgan_mnist.ipynb`. Add the cells below in order.

---

## Project Structure

```
ai-learning/
├── venv/                    # Your virtual environment
└── dcgan_mnist.ipynb        # Your notebook
    └── data/                # MNIST will auto-download here
```

---

## The Code — Step by Step

---

### Cell 1: Imports & Config

```python
import torch
import torch.nn as nn
import torchvision
import torchvision.transforms as transforms
from torch.utils.data import DataLoader
import matplotlib.pyplot as plt

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using: {device}")

# Hyperparameters
LATENT_DIM = 64    # Size of the random noise vector fed to the Generator
BATCH_SIZE = 64    # Number of images processed at once — keep low for 2GB VRAM
LR = 0.0002        # Learning rate — standard for GANs
EPOCHS = 30        # Number of full passes through the dataset
IMAGE_SIZE = 28    # MNIST images are 28x28 pixels
```

**What's happening here:**

- `device` automatically picks the GPU if CUDA is available, otherwise falls back to CPU.
- `LATENT_DIM = 64` means the Generator receives a vector of 64 random numbers as its "seed" — it learns to turn this noise into an image.
- `BATCH_SIZE = 64` is a safe limit for your 2GB GPU. If you get out-of-memory errors, drop this to `32`.
- `LR = 0.0002` with betas `(0.5, 0.999)` is the classic Adam configuration specifically tuned for GANs (from the original DCGAN paper).

---

### Cell 2: Load MNIST Data

```python
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5])  # Rescale pixel values from [0,1] to [-1, 1]
])

dataset = torchvision.datasets.MNIST(
    root="./data",      # Downloads to a /data folder in your working directory
    train=True,         # Use the training split (60,000 images)
    download=True,      # Auto-downloads if not already present
    transform=transform
)

loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
```

**What's happening here:**

- `transforms.ToTensor()` converts each image from a PIL image (0–255) to a PyTorch tensor (0.0–1.0).
- `transforms.Normalize([0.5], [0.5])` shifts values to the range **[-1, 1]**. This matches the Generator's output (which uses `Tanh`, also outputting [-1, 1]).
- `DataLoader` handles batching and shuffling automatically — it feeds 64 images at a time to the training loop.
- MNIST will download ~11MB to `./data/` on first run.

---

### Cell 3: Generator

```python
class Generator(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = nn.Sequential(
            nn.Linear(LATENT_DIM, 256),   # 64 noise values --> 256 features
            nn.ReLU(),
            nn.Linear(256, 512),           # 256 --> 512 features
            nn.ReLU(),
            nn.Linear(512, IMAGE_SIZE * IMAGE_SIZE),  # 512 --> 784 (28x28)
            nn.Tanh()                      # Output in [-1, 1] to match normalised data
        )

    def forward(self, z):
        return self.model(z).view(-1, 1, IMAGE_SIZE, IMAGE_SIZE)
```

**What's happening here:**

- The Generator is a simple **feedforward neural network** (no convolutions).
- It takes a noise vector `z` of size 64 and progressively expands it: `64 → 256 → 512 → 784`.
- The final `784` values are reshaped by `.view(-1, 1, 28, 28)` into a proper image tensor of shape `[batch, channels, height, width]`.
- `Tanh` ensures outputs stay in [-1, 1], matching the normalised real images.
- **Critical:** `forward` must be **indented inside the class** at the same level as `__init__`. If it's at column 0, Python won't recognise it as a method and you'll get a `NotImplementedError`.

---

### Cell 4: Discriminator

```python
class Discriminator(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = nn.Sequential(
            nn.Flatten(),                  # Collapse 28x28 image to 784 values
            nn.Linear(IMAGE_SIZE * IMAGE_SIZE, 512),  # 784 --> 512
            nn.LeakyReLU(0.2),             # LeakyReLU prevents "dying neurons"
            nn.Linear(512, 256),           # 512 --> 256
            nn.LeakyReLU(0.2),
            nn.Linear(256, 1),             # 256 --> 1 single score
            nn.Sigmoid()                   # Squash to [0, 1]: 0=fake, 1=real
        )

    def forward(self, x):
        return self.model(x)
```

**What's happening here:**

- The Discriminator is the "judge" — it outputs a single number between 0 and 1.
  - Output close to **1** = "this looks real"
  - Output close to **0** = "this looks fake"
- `nn.Flatten()` converts the 2D image tensor back to a flat vector for the linear layers.
- **LeakyReLU(0.2)** is used instead of regular ReLU because it allows a small gradient for negative values. This prevents neurons from permanently "dying" (outputting 0 for all inputs), which is a common problem in Discriminators.
- **Why does G use ReLU but D uses LeakyReLU?** Convention: the Generator is building features up (benefits from clean activations), while the Discriminator is classifying (benefits from the stability of LeakyReLU).

---

### Cell 5: Training Loop

```python
G = Generator().to(device)
D = Discriminator().to(device)

opt_G = torch.optim.Adam(G.parameters(), lr=LR, betas=(0.5, 0.999))
opt_D = torch.optim.Adam(D.parameters(), lr=LR, betas=(0.5, 0.999))
criterion = nn.BCELoss()  # Binary Cross-Entropy: measures how wrong a prediction is

for epoch in range(EPOCHS):
    for real_imgs, _ in loader:
        real_imgs = real_imgs.to(device)
        batch = real_imgs.size(0)  # Actual batch size (last batch may be smaller)

        # Labels: real images = 1, fake images = 0
        real_labels = torch.ones(batch, 1).to(device)
        fake_labels = torch.zeros(batch, 1).to(device)

        # ---- Train Discriminator ----
        # Goal: correctly label real images as 1 and fake images as 0
        z = torch.randn(batch, LATENT_DIM).to(device)
        fake_imgs = G(z)

        loss_D = criterion(D(real_imgs), real_labels) + \
                 criterion(D(fake_imgs.detach()), fake_labels)
        # .detach() stops gradients flowing back into G during D's update
        opt_D.zero_grad()
        loss_D.backward()
        opt_D.step()

        # ---- Train Generator ----
        # Goal: fool D into labelling fake images as real (label=1)
        loss_G = criterion(D(fake_imgs), real_labels)
        opt_G.zero_grad()
        loss_G.backward()
        opt_G.step()

    print(f"Epoch {epoch+1}/{EPOCHS} | D Loss: {loss_D.item():.4f} | G Loss: {loss_G.item():.4f}")
```

**What's happening here:**

This is the core GAN training loop. Each batch goes through **two separate updates**:

**1. Train the Discriminator:**
- Feed real images → D should output 1 → compute loss vs `real_labels`
- Feed fake images (from G) → D should output 0 → compute loss vs `fake_labels`
- Add the two losses together, backpropagate, update D's weights
- `fake_imgs.detach()` is important: it prevents gradients from flowing back into G during this step — we only want to update D here

**2. Train the Generator:**
- Feed the same fake images to D again (but **without** `.detach()` this time)
- G wants D to output 1 (be fooled), so we compute loss vs `real_labels`
- Backpropagate through D and into G, but only update G's weights

**What to expect from the loss values:**
- Early epochs: D loss will be very low (D wins easily), G loss will be high
- After ~10 epochs: both losses should settle around 0.5–1.5
- If D loss collapses to 0.0: D has completely dominated G — try lowering LR slightly
- If G loss explodes to 10+: G is failing — this is normal early on

---

### Cell 6: View Generated Images

```python
G.eval()  # Switch Generator to evaluation mode (disables dropout etc.)
with torch.no_grad():  # Disable gradient tracking — we're just generating, not training
    z = torch.randn(16, LATENT_DIM).to(device)
    samples = G(z).cpu().squeeze()  # Move to CPU, remove channel dimension

fig, axes = plt.subplots(4, 4, figsize=(6, 6))
for i, ax in enumerate(axes.flat):
    ax.imshow(samples[i], cmap="gray", vmin=-1, vmax=1)
    ax.axis("off")
plt.tight_layout()
plt.show()
```

**What's happening here:**

- `G.eval()` switches off any training-specific behaviour (like dropout).
- `torch.no_grad()` tells PyTorch not to build a computation graph — faster and uses less memory.
- We generate 16 images by passing 16 random noise vectors through G.
- `.cpu()` moves the tensor off the GPU so matplotlib can use it.
- `.squeeze()` removes the single channel dimension: `[16, 1, 28, 28]` → `[16, 28, 28]`.
- `vmin=-1, vmax=1` matches our normalisation range for correct display.

After 30 epochs you should see blurry but recognisable digit shapes. They get sharper with more epochs.

---

## Common Errors & Fixes

### `NotImplementedError: Module [Generator] is missing the required "forward" function`

**Cause:** The `forward` method was pasted outside the class body (wrong indentation).

**Fix:** Make sure both `__init__` and `forward` are indented 4 spaces inside the class:

```python
class Generator(nn.Module):
    def __init__(self):       # <-- 4 spaces indent
        ...

    def forward(self, z):     # <-- 4 spaces indent (same level as __init__)
        ...
```

After fixing, do **Kernel → Restart & Run All** to clear stale class definitions from memory.

---

### `RuntimeError: CUDA out of memory`

**Fix:** Reduce batch size:

```python
BATCH_SIZE = 32  # Down from 64
```

---

### `torch.cuda.is_available()` returns `False`

**Fix:** Reinstall PyTorch with CUDA support:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

---

### Loss values explode or go to NaN

**Likely cause:** Learning rate too high, or mode collapse (G always generates the same image).

**Fix:** Lower the learning rate:

```python
LR = 0.00005  # Down from 0.0002
```

---

## Training Schedule

| Day | Goal |
|-----|------|
| **Day 1** | Verify CUDA works, run Cells 1–2, confirm MNIST downloads cleanly |
| **Day 2** | Build and test Generator & Discriminator (Cells 3–4) with a quick forward-pass check |
| **Day 3** | Run training for 5 epochs, observe loss values printing correctly |
| **Day 4–5** | Run full 30 epochs, view generated images in Cell 6 |
| **Day 6–7** | Experiment: try 50 epochs, tweak `LATENT_DIM`, observe image quality change |

**Approximate training time on GTX 850M:** ~10–20 minutes for 30 epochs on MNIST.

---

## Next Steps

Once your GAN is producing recognisable digits, here are natural progressions:

1. **Increase epochs to 50–100** — images get noticeably sharper.
2. **Switch to CIFAR-10** — colour images (32×32), more challenging. Change `IMAGE_SIZE = 32` and update the data loader.
3. **Add Convolutional layers (DCGAN)** — replace `nn.Linear` with `nn.ConvTranspose2d` in the Generator and `nn.Conv2d` in the Discriminator for much sharper results.
4. **Add a Conditional GAN (cGAN)** — pass the digit label into the Generator so you can control which digit it generates.
5. **Save your model** — add `torch.save(G.state_dict(), "generator.pth")` after training to preserve your trained weights.

---

*Built and tested on Linux Mint, GTX 850M (2GB VRAM), Python 3.12, PyTorch with CUDA 11.8.*
