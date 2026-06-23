import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from typing import List, Dict, Any, Optional
from src.config import config

class LocalLLMClient:
    def __init__(self):
        self.tokenizer = None
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def _load_model(self):
        """Lazy load tokenizer and model to conserve memory until needed."""
        if self.model is None or self.tokenizer is None:
            model_name = config.llm_model_name
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            
            # Load model (use float16 if on GPU, float32 on CPU)
            torch_dtype = torch.float16 if self.device == "cuda" else torch.float32
            
            if self.device == "cuda":
                self.model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    torch_dtype=torch_dtype,
                    device_map="auto"
                )
            else:
                self.model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    torch_dtype=torch_dtype
                )
                self.model = self.model.to(self.device)

    def generate(self, prompt: str, temperature: float = None, system_prompt: str = None) -> str:
        """
        Generates text using the local LLM with chat formatting.
        
        Args:
            prompt: User input prompt.
            temperature: Generation temperature. Defaults to config.temperature_default.
            system_prompt: System instructions.
            
        Returns:
            The generated text string.
        """
        self._load_model()
        
        temp = temperature if temperature is not None else config.temperature_default
        sys_prompt = system_prompt or "You are a helpful assistant. Answer questions truthfully and accurately."
        
        # Build chat message structure
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": prompt}
        ]
        
        # Apply model-specific chat template (tokenizer handles this automatically)
        formatted_prompt = self.tokenizer.apply_chat_template(
            messages, 
            tokenize=False, 
            add_generation_prompt=True
        )
        
        # Move inputs to device (cuda or cpu)
        inputs = self.tokenizer([formatted_prompt], return_tensors="pt").to(self.device)
        
        # Set parameters for generation
        do_sample = temp > 0.0
        
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=temp if do_sample else None,
                do_sample=do_sample,
                pad_token_id=self.tokenizer.eos_token_id,
                eos_token_id=self.tokenizer.eos_token_id
            )
            
        # Decode only the generated tokens (skipping the prompt tokens)
        generated_tokens = outputs[0][inputs.input_ids.shape[1]:]
        response = self.tokenizer.decode(generated_tokens, skip_special_tokens=True)
        
        return response.strip()
