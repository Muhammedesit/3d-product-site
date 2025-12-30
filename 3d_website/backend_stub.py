"""Optional future backend stub (not used by the static site).

Phase 2 goal:
- Move geometry generation server-side for stronger boolean ops and better fidelity.
- Keep frontend calling POST /generate with JSON parameters.

Run (later):
  uvicorn backend_stub:app --reload

Dependencies (later):
  fastapi, uvicorn, trimesh, shapely, numpy
"""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Dual Text Illusion Generator API (Stub)")


class GenerateRequest(BaseModel):
    wordA: str
    wordB: str
    font: str = "Sans"
    padding: float = 2.5
    fillet: float = 0.5


@app.post("/generate")
def generate(req: GenerateRequest):
    # TODO: Implement geometry generation with trimesh/shapely.
    return {
        "message": "Not implemented yet",
        "received": req.model_dump(),
    }
