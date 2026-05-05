"""
Model management for the Unified Local AI System.

Handles loading and interaction with:
- Ollama models (SmolLM, Qwen, TinyLlama via API)
- HuggingFace TinyLlama (direct loading for router/critic)
"""

import subprocess
from typing import Optional, Dict, Any
from pathlib import Path

try:
    from langchain_ollama import OllamaLLM
except ImportError:
    from langchain_community.llms import Ollama as OllamaLLM

from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

from .config import (
    OLLAMA_MODELS,
    HUGGINGFACE_MODEL,
    MAX_TOKENS,
    TEMPERATURE,
    CONTEXT_WINDOW,
    OLLAMA_NOT_RUNNING,
    MODEL_NOT_FOUND
)


# ============================================================================
# OLLAMA MANAGEMENT
# ============================================================================

def check_ollama_running() -> bool:
    """Check if Ollama service is running."""
    try:
        result = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def check_model_exists(model_name: str) -> bool:
    """Check if a specific Ollama model is pulled and available."""
    try:
        result = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return model_name in result.stdout
        return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def get_ollama_model(model_key: str, **kwargs) -> Optional[OllamaLLM]:
    """
    Get an Ollama model instance.
    
    Args:
        model_key: Key from OLLAMA_MODELS dict (e.g., 'smollm', 'qwen', 'tinyllama')
        **kwargs: Additional parameters to pass to OllamaLLM
    
    Returns:
        OllamaLLM instance or None if unavailable
    """
    if not check_ollama_running():
        print(OLLAMA_NOT_RUNNING)
        return None
    
    model_name = OLLAMA_MODELS.get(model_key)
    if not model_name:
        print(f"⚠️  Unknown model key: {model_key}")
        return None
    
    if not check_model_exists(model_name):
        print(MODEL_NOT_FOUND.format(model=model_name))
        return None
    
    # Default parameters
    params = {
        "model": model_name,
        "temperature": kwargs.get("temperature", TEMPERATURE),
        "num_predict": kwargs.get("num_predict", MAX_TOKENS.get(model_key, 300)),
        "num_ctx": kwargs.get("num_ctx", CONTEXT_WINDOW)
    }
    
    # Override with any user-provided kwargs
    params.update(kwargs)
    
    try:
        return OllamaLLM(**params)
    except Exception as e:
        print(f"⚠️  Failed to load {model_name}: {e}")
        return None


# ============================================================================
# HUGGINGFACE TINYLLAMA (Router/Critic)
# ============================================================================

class TinyLlamaLocal:
    """
    Direct HuggingFace TinyLlama loader for router and critic roles.
    Avoids Ollama HTTP overhead for high-frequency calls.
    """
    
    def __init__(self, model_name: str = HUGGINGFACE_MODEL):
        """
        Load TinyLlama from HuggingFace.
        
        Args:
            model_name: HuggingFace model identifier
        """
        self.model_name = model_name
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tokenizer = None
        self.model = None
        self._loaded = False
    
    def load(self):
        """Load the model and tokenizer (lazy loading)."""
        if self._loaded:
            return
        
        print(f"Loading {self.model_name} on {self.device}...")
        
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                low_cpu_mem_usage=True
            )
            self.model.to(self.device)
            self.model.eval()
            self._loaded = True
            print(f"✓ {self.model_name} loaded successfully")
        except Exception as e:
            print(f"⚠️  Failed to load {self.model_name}: {e}")
            raise
    
    def generate(self, prompt: str, max_tokens: int = 100, temperature: float = TEMPERATURE) -> str:
        """
        Generate text from a prompt.
        
        Args:
            prompt: Input text
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
        
        Returns:
            Generated text (response only, without prompt)
        """
        if not self._loaded:
            self.load()
        
        # Tokenize input
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        
        # Generate
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=temperature,
                do_sample=temperature > 0,
                pad_token_id=self.tokenizer.eos_token_id
            )
        
        # Decode and remove prompt
        full_text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        response = full_text[len(prompt):].strip()
        
        return response
    
    def route_question(self, question: str) -> str:
        """
        Router: Classify question type.
        
        Args:
            question: User's question
        
        Returns:
            Category: "GENERAL", "CODE", or "MULTILINGUAL"
        """
        prompt = f"""Classify this question into exactly ONE category:
- GENERAL: factual questions, explanations, summaries
- CODE: programming, debugging, technical implementation
- MULTILINGUAL: questions in non-English languages

Question: {question}

Category:"""
        
        response = self.generate(prompt, max_tokens=10, temperature=0.1)
        
        # Extract category from response
        response_upper = response.upper()
        if "CODE" in response_upper:
            return "CODE"
        elif "MULTILINGUAL" in response_upper:
            return "MULTILINGUAL"
        else:
            return "GENERAL"
    
    def critique_answer(self, question: str, answer: str) -> Dict[str, Any]:
        """
        Critic: Evaluate answer quality.
        
        Args:
            question: Original question
            answer: Model's answer
        
        Returns:
            Dict with 'passes' (bool) and 'reason' (str)
        """
        prompt = f"""Evaluate if this answer properly addresses the question.

Question: {question}

Answer: {answer}

Does the answer directly address the question and provide clear information?
Respond with YES or NO, then briefly explain why.

Evaluation:"""
        
        response = self.generate(prompt, max_tokens=50, temperature=0.1)
        
        # Parse response
        response_upper = response.upper()
        passes = "YES" in response_upper and "NO" not in response_upper.split("YES")[0]
        
        return {
            "passes": passes,
            "reason": response.strip()
        }


# ============================================================================
# MODEL LOADER (Facade)
# ============================================================================

class ModelManager:
    """
    Central interface for all model operations.
    Manages both Ollama and HuggingFace models.
    """
    
    def __init__(self):
        self.ollama_models: Dict[str, OllamaLLM] = {}
        self.tinyllama_local: Optional[TinyLlamaLocal] = None
    
    def get_ollama(self, model_key: str, **kwargs) -> Optional[OllamaLLM]:
        """
        Get or create an Ollama model instance.
        Caches instances for reuse.
        """
        if model_key not in self.ollama_models:
            self.ollama_models[model_key] = get_ollama_model(model_key, **kwargs)
        return self.ollama_models[model_key]
    
    def get_tinyllama(self) -> TinyLlamaLocal:
        """Get or create TinyLlama local instance (lazy loading)."""
        if self.tinyllama_local is None:
            self.tinyllama_local = TinyLlamaLocal()
        return self.tinyllama_local
    
    def route_question(self, question: str) -> str:
        """Route question using TinyLlama."""
        tinyllama = self.get_tinyllama()
        return tinyllama.route_question(question)
    
    def critique_answer(self, question: str, answer: str) -> Dict[str, Any]:
        """Critique answer using TinyLlama."""
        tinyllama = self.get_tinyllama()
        return tinyllama.critique_answer(question, answer)
    
    def invoke_ollama(self, model_key: str, prompt: str, **kwargs) -> str:
        """
        Invoke an Ollama model with a prompt.
        
        Args:
            model_key: Model key ('smollm', 'qwen', 'tinyllama')
            prompt: Input prompt
            **kwargs: Additional generation parameters
        
        Returns:
            Model response
        """
        model = self.get_ollama(model_key, **kwargs)
        if model is None:
            return "Error: Model not available"
        
        try:
            return model.invoke(prompt)
        except Exception as e:
            return f"Error generating response: {e}"
    
    def check_system_ready(self) -> tuple[bool, list[str]]:
        """
        Check if all required models are available.
        
        Returns:
            Tuple of (is_ready, list_of_issues)
        """
        issues = []
        
        if not check_ollama_running():
            issues.append("Ollama is not running")
            return False, issues
        
        for key, model_name in OLLAMA_MODELS.items():
            if not check_model_exists(model_name):
                issues.append(f"Model not found: {model_name}")
        
        if issues:
            return False, issues
        
        return True, []


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("Testing model management...\n")
    
    # Test Ollama availability
    print("1. Checking Ollama status...")
    if check_ollama_running():
        print("   ✓ Ollama is running")
    else:
        print("   ✗ Ollama is not running")
    
    # Test model availability
    print("\n2. Checking models...")
    for key, model_name in OLLAMA_MODELS.items():
        exists = check_model_exists(model_name)
        status = "✓" if exists else "✗"
        print(f"   {status} {model_name}")
    
    # Test ModelManager
    print("\n3. Testing ModelManager...")
    manager = ModelManager()
    is_ready, issues = manager.check_system_ready()
    
    if is_ready:
        print("   ✓ System ready")
        
        # Test quick inference
        print("\n4. Testing quick inference...")
        response = manager.invoke_ollama("tinyllama", "What is 2+2?", num_predict=50)
        print(f"   TinyLlama response: {response[:100]}...")
    else:
        print("   ✗ System not ready:")
        for issue in issues:
            print(f"     - {issue}")
