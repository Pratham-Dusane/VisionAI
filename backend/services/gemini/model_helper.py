"""
Model Helper — Get the correct Gemini model name
Handles model version compatibility across different regions and time periods.
"""

import os
import vertexai
from vertexai.generative_models import GenerativeModel


def get_gemini_model():
    """
    Get the best available Gemini model.
    Tries multiple model names in order of preference.
    
    Returns:
        GenerativeModel instance
    
    Raises:
        Exception if no model is available
    """
    project_id = os.getenv("GCP_PROJECT_ID")
    if not project_id:
        raise ValueError("GCP_PROJECT_ID not set in environment")
    
    vertexai.init(project=project_id, location="us-central1")
    
    # Model names to try, in order of preference (stable GA models only)
    model_names = [
        "gemini-1.5-flash-002",    # Latest flash model (faster, cheaper)
        "gemini-1.5-flash-001",    # Previous flash
        "gemini-1.5-flash",        # Generic flash
        "gemini-1.0-pro-002",      # 1.0 stable
        "gemini-1.0-pro-001",      # 1.0 previous
        "gemini-1.0-pro",          # Generic 1.0
    ]
    
    last_error = None
    
    for model_name in model_names:
        try:
            model = GenerativeModel(model_name)
            # Test the model with a simple generation
            test_response = model.generate_content(
                "Say 'OK'",
                generation_config={"max_output_tokens": 10}
            )
            if test_response.text:
                print(f"[GEMINI] Using model: {model_name}")
                return GenerativeModel(model_name)  # Return fresh instance
        except Exception as e:
            last_error = e
            print(f"[GEMINI] Model {model_name} not available: {str(e)[:100]}")
            continue
    
    # If we get here, no model worked
    raise Exception(
        f"No Gemini model available. Last error: {str(last_error)}\n"
        f"Tried models: {', '.join(model_names)}\n"
        f"Please check:\n"
        f"1. Vertex AI API is enabled: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com\n"
        f"2. Generative Language API is enabled: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com\n"
        f"3. Service account has 'Vertex AI User' role\n"
        f"4. Project ID is correct: {project_id}\n"
        f"5. Wait 2-3 minutes after enabling APIs for propagation"
    )


def list_available_models():
    """
    List all available models in the project.
    Useful for debugging.
    
    Returns:
        List of model names
    """
    try:
        from google.cloud import aiplatform
        
        project_id = os.getenv("GCP_PROJECT_ID")
        if not project_id:
            return []
        
        aiplatform.init(project=project_id, location="us-central1")
        
        # List publisher models
        models = aiplatform.Model.list(
            filter='labels.publisher_model_name:gemini*'
        )
        
        return [model.display_name for model in models]
    
    except Exception as e:
        print(f"[GEMINI] Error listing models: {e}")
        return []
