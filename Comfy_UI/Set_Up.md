# ComfyUI on Google Colab
#Code Guide & Step-by-Step Instructions

---

## Part A — Code Explanation (Block by Block)

---

### Block 1 — Set the Workspace Path

```python
import os
WORKSPACE = "/content/drive/MyDrive/ComfyUI"
print(f"Workspace set to: {WORKSPACE}")
```
**What it does:**
This block defines where ComfyUI lives on your Google Drive. All persistent data — your workflows, custom nodes, user settings, and logs — will be stored and read from this path.
**Key points:**
- `/content/drive/MyDrive/` is the standard mount point for Google Drive inside Colab.
- `WORKSPACE` is a Python variable reused throughout the notebook. If you skip this cell and run a later cell, it may fail with a `NameError`.
- The folder `ComfyUI` inside your Drive must exist (created during the clone step, not shown here).

---

### Block 2 — Install Core Dependencies

```python
!pip install xformers!=0.0.18 --extra-index-url https://download.pytorch.org/whl/cu121
!pip install GitPython
!pip install comfy-aimdo comfy-kitchen comfyui-frontend-package
!pip install -r requirements.txt
!pip install comfy-aimdo==0.1.7   # ⚠️ See warning below
print("imported")
```
**What it does:**
Installs all Python packages that ComfyUI needs to run.

**Key commands:**
| Command | Purpose |
|---|---|
| `xformers` | Memory-efficient attention — speeds up image generation significantly |
| `GitPython` | Lets ComfyUI Manager clone/update custom node repos from GitHub |
| `comfy-aimdo` | Anthropic-style backend operations for ComfyUI (tensor ops, host buffers) |
| `comfy-kitchen` | Backend acceleration library used by ComfyUI |
| `comfyui-frontend-package` | The web UI frontend served in your browser |
| `-r requirements.txt` | Installs all remaining dependencies declared by the ComfyUI project |

> ⚠️ **Known issue:** The last line pins `comfy-aimdo==0.1.7`, which is **too old**. The ComfyUI code on your Drive requires `>=0.2.12` (which introduced `comfy_aimdo.host_buffer`). This version conflict is the root cause of the `host_buffer not found` error. See the fix in Block 4.

---

### Block 3 — Symlink Models to Fast Temporary Storage *(recommended addition)*

```python
import os

WORKSPACE = "/content/drive/MyDrive/ComfyUI"
TEMP_MODELS = "/content/models"  # Fast local SSD — lost on runtime restart

# Create local model directories
for folder in ["checkpoints", "loras", "vae", "controlnet", "clip"]:
    os.makedirs(f"{TEMP_MODELS}/{folder}", exist_ok=True)

# Point ComfyUI's model folders to the fast temp path via symlinks
MODEL_DIR = f"{WORKSPACE}/models"
for folder in ["checkpoints", "loras", "vae", "controlnet", "clip"]:
    drive_path = f"{MODEL_DIR}/{folder}"
    temp_path  = f"{TEMP_MODELS}/{folder}"
    if os.path.islink(drive_path):
        os.unlink(drive_path)
    elif os.path.isdir(drive_path):
        os.rename(drive_path, drive_path + "_backup")
    os.symlink(temp_path, drive_path)
    print(f"✅ Symlinked {drive_path} → {temp_path}")

print("Model dirs now point to fast temp storage!")
```

**What it does:**
By default, models would be read from Google Drive, which is slow (Drive I/O is much slower than Colab's local SSD). This block creates empty folders in Colab's fast local storage (`/content/models/`) and replaces the Drive model folders with symlinks pointing there. ComfyUI continues to find models at the expected paths — but reads them from fast local storage.

**Key points:**
- `/content/models/` is on Colab's local disk. It is **fast but temporary** — it is wiped when the runtime restarts.
- Models must be re-downloaded each session (see Step-by-Step guide below).
- Workflows and custom nodes remain on Drive and **persist across sessions**.
- `os.symlink(temp_path, drive_path)` is the critical command — it replaces the Drive folder with a pointer to the local folder.

---

### Block 4 — Start ComfyUI *(corrected version)*

```python
import os

WORKSPACE = "/content/drive/MyDrive/ComfyUI"

try:
    WORKSPACE
except NameError:
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"

if os.path.exists(WORKSPACE):
    %cd $WORKSPACE

    # ✅ FIXED: Install the version that includes host_buffer
    !pip install --upgrade "comfy-aimdo>=0.2.12" comfy-kitchen

    # ✅ Launch ComfyUI — disable-cuda-malloc avoids buffer allocation errors
    !python main.py --dont-print-server --disable-cuda-malloc
else:
    print(f"❌ ERROR: {WORKSPACE} not found. Check your Google Drive!")
```

**What it does:**
Navigates into the ComfyUI folder, ensures the correct package versions are installed, and launches the ComfyUI server.

**Key commands:**
| Command | Purpose |
|---|---|
| `%cd $WORKSPACE` | Changes the working directory to the ComfyUI folder (required — `main.py` must run from inside the project) |
| `pip install --upgrade "comfy-aimdo>=0.2.12"` | **The critical fix** — installs the version that contains `host_buffer`, resolving the `ModuleNotFoundError` |
| `python main.py` | Starts the ComfyUI server on port `8188` |
| `--dont-print-server` | Suppresses verbose server startup logs |
| `--disable-cuda-malloc` | Disables CUDA's async memory allocator, which can conflict with pinned memory on some Colab GPU configurations |

> ⚠️ **What the original code did wrong:** The original cell ran `pip install --upgrade comfy-aimdo==0.1.7`, which *downgraded* the package to a version that doesn't have `host_buffer` — the opposite of what was needed.

---

### Block 5 — Expose ComfyUI via Cloudflared (Recommended Tunnel)

```python
!npm install -g localtunnel

import subprocess, threading, time, socket, urllib.request

def iframe_thread(port):
    while True:
        time.sleep(0.5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', port))
        if result == 0:
            break
        sock.close()
    print("ComfyUI finished loading, launching tunnel...")
    print("Password/IP:", urllib.request.urlopen('https://ipv4.icanhazip.com').read().decode('utf8').strip())
    p = subprocess.Popen(["lt", "--port", str(port)], stdout=subprocess.PIPE)
    for line in p.stdout:
        print(line.decode(), end='')

threading.Thread(target=iframe_thread, daemon=True, args=(8188,)).start()
!python main.py --dont-print-server
```

**What it does:**
Since ComfyUI runs on port `8188` inside Colab's private environment, it isn't directly accessible from your browser. This block creates a public tunnel URL so you can open ComfyUI in any browser tab.

**Key points:**
- `iframe_thread` runs in a background thread, polling every 0.5 seconds until ComfyUI is fully loaded (port 8188 becomes reachable).
- Once the server is ready, it starts `localtunnel` (`lt`) and prints a public URL like `https://xxxx.loca.lt`.
- The IP printed alongside is the **password** localtunnel requires you to enter on the tunnel landing page.
- `threading.Thread(..., daemon=True)` ensures the thread shuts down automatically if the main process ends.

---

### Block 6 — Alternative: Colab iFrame (Fallback Only)

```python
import threading, time, socket

def iframe_thread(port):
    while True:
        time.sleep(0.5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', port))
        if result == 0:
            break
        sock.close()
    from google.colab import output
    output.serve_kernel_port_as_iframe(port, height=1024)
    print("Open in a new window:")
    output.serve_kernel_port_as_window(port)

threading.Thread(target=iframe_thread, daemon=True, args=(8188,)).start()
!python main.py --dont-print-server
```

**What it does:**
An alternative to localtunnel that embeds ComfyUI directly inside the Colab notebook as an iframe.

**Key points:**
- Use this **only** if localtunnel is unavailable or unreliable.
- Live image previews (websocket-based) **will not work** in the iframe due to Colab's websocket restrictions.
- If you see a `403` error in the iframe, a browser extension or Firefox's strict mode is blocking it — try Chrome.

---

## Part B — Step-by-Step User Guide

---

### Prerequisites

- A Google account with Google Drive enabled.
- A Google Colab account (free tier works, but Pro is recommended for longer sessions and better GPUs).
- Your ComfyUI folder already cloned to `MyDrive/ComfyUI` on your Google Drive. If not, add a clone cell before Block 1:
  ```bash
  !git clone https://github.com/comfyanonymous/ComfyUI /content/drive/MyDrive/ComfyUI
  ```

---

### Step 1 — Open the Notebook and Enable GPU

1. Open the notebook in Google Colab.
2. Go to **Runtime → Change runtime type**.
3. Set **Hardware accelerator** to **GPU** (T4 is the free option; A100 is available on Pro).
4. Click **Save**.

> Without a GPU, ComfyUI will run on CPU — extremely slowly, or not at all for large models.

---

### Step 2 — Mount Google Drive

If there is a Drive mount cell in the notebook, run it first. If not, add this cell at the top and run it:

```python
from google.colab import drive
drive.mount('/content/drive')
```

A browser popup will ask you to authorise access. Click through and wait for the confirmation message: `Mounted at /content/drive`.

---

### Step 3 — Set the Workspace Path (Block 1)

Run **Block 1**. You should see:

```
Workspace set to: /content/drive/MyDrive/ComfyUI
```

If you get a path error, verify that the `ComfyUI` folder exists in your Drive's root `MyDrive` folder.

---

### Step 4 — Install Dependencies (Block 2)

Run **Block 2**. This will take 1–3 minutes on first run. On subsequent runs, most packages will already be satisfied and it will complete quickly.

You should see `imported` printed at the end. Ignore any `pip` warnings about protobuf or dependency conflicts — these are expected.

> **Do not change the package versions** unless you are intentionally upgrading. The versions pinned here are known to work together.

---

### Step 5 — Symlink Model Folders to Fast Storage (Block 3)

Run **Block 3**. You should see a confirmation for each model folder:

```
✅ Symlinked /content/drive/MyDrive/ComfyUI/models/checkpoints → /content/models/checkpoints
✅ Symlinked /content/drive/MyDrive/ComfyUI/models/loras → /content/models/loras
...
```

This only needs to run once per session.

---

### Step 6 — Download Your Models into Temporary Storage

After Block 3, download your model files into `/content/models/checkpoints/` (or the appropriate subfolder). For example:

```python
# Example: download a checkpoint from HuggingFace
!wget -q -O /content/models/checkpoints/your_model.safetensors \
  "https://huggingface.co/your-repo/resolve/main/your_model.safetensors"
```

Or use the `huggingface_hub` library:

```python
from huggingface_hub import hf_hub_download
hf_hub_download(
    repo_id="your-org/your-repo",
    filename="your_model.safetensors",
    local_dir="/content/models/checkpoints/"
)
```

> ⚠️ **Remember:** These files live in temporary storage. You must re-download them each time the Colab runtime restarts. Your **workflows** (saved via ComfyUI's UI) are stored on Drive and will persist.

---

### Step 7 — Start ComfyUI (Block 4 — Corrected Version)

Replace the original "Start ComfyUI" cell with the corrected Block 4 above, then run it.

You should see output like:

```
/content/drive/MyDrive/ComfyUI
...
Total VRAM 14913 MB, total RAM 12976 MB
Set vram state to: NORMAL_VRAM
Device: cuda:0 Tesla T4
```

If you see `ModuleNotFoundError: No module named 'comfy_aimdo.host_buffer'`, it means `comfy-aimdo` was not upgraded correctly — re-run the `pip install --upgrade "comfy-aimdo>=0.2.12"` line manually, then restart.

---

### Step 8 — Open ComfyUI in Your Browser (Block 5)

Run **Block 5** (the localtunnel cell). Wait until you see a line like:

```
your url is: https://abc123.loca.lt
```

1. Copy that URL and open it in a new browser tab.
2. On the localtunnel landing page, paste the **IP address** that was printed just above the URL (this is the tunnel password).
3. ComfyUI should now load fully in your browser.

> If localtunnel is slow or stuck, use the iFrame fallback in **Block 6** instead.

---

### Step 9 — Save and Load Workflows

- **Saving a workflow:** In the ComfyUI UI, click the **Save** button. The `.json` file is written to `/content/drive/MyDrive/ComfyUI/user/` — it persists on Drive automatically.
- **Loading a workflow:** Click **Load** and select your saved `.json` file from Drive.
- **Exporting:** You can also drag a workflow JSON directly onto the ComfyUI canvas to load it.

---

### Troubleshooting Quick Reference

| Error | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: comfy_aimdo.host_buffer` | `comfy-aimdo` version too old | Upgrade to `>=0.2.12` in Block 4 |
| `❌ ERROR: /content/drive/MyDrive/ComfyUI not found` | Drive not mounted or path wrong | Run Drive mount cell, verify folder name |
| Localtunnel stuck / no URL | Localtunnel service issue | Use the iFrame fallback (Block 6) |
| `403` error in iFrame | Browser extension or Firefox restriction | Use Chrome, disable extensions |
| Model not found in ComfyUI | Model downloaded to wrong folder | Check it landed in `/content/models/checkpoints/` |
| Very slow generation | Running on CPU (no GPU) | Set runtime to GPU: Runtime → Change runtime type |
| `WARNING: You need pytorch with cu130 or higher` | PyTorch CUDA version mismatch | Informational only — generation will still work on cu128 |
