from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
from dotenv import load_dotenv
import os
import io
from fastapi.responses import FileResponse
import json

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel



load_dotenv()
 
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


openai_client = OpenAI(api_key=os.environ.get("OPENAI_KEY"))

def generate_prompt(game_state):
    return f"""
   
    
    The current game state in json format is:
    f{game_state}

    Based on this information, give a very short suggestion with only two sentences. The first sentence explaining the current situation and the second sentence providing advice on what to do next. Keep response to 5 seconds max to text-to-speech.
    """


@app.get("/tts")
async def tts(message):
    
    
    print(message)
    
    tts_res = openai_client.audio.speech.create(
        model="tts-1",
        voice="echo",
        input=message,
        response_format="wav"
    )
    tts_res.stream_to_file("test.wav")
    return FileResponse("test.wav", media_type="audio/wav")


@app.post("/suggestion")
async def suggest(request: Request):
    # print(await request.json())
    req = await request.json()
    gameState = req['data']
    completion = openai_client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": " You are an AI coach for league of legends junglers. This is the current game state."},
        {"role": "user", "content": generate_prompt(gameState)}
    ]
    )   
    
    response = completion.choices[0].message.content
    
    print(response)
    
    return dict({ 'message': response})

