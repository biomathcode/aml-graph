import os
import time
import json
import tempfile
import shutil
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from schemas import (
    FieldRule,
    DocumentTypeSchema,
    ExtractionResponse,
    DEFAULT_SCHEMAS
)
from extractor import run_indra_ocr, extract_fields_with_schema, get_indra_converter

app = FastAPI(
    title="OpenKYC Indra OCR Service",
    description="High performance document OCR, layout understanding, and schema extraction powered by Indra OCR (datalab-to/indra)",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "service": "openkyc-indra-ocr",
        "status": "ready",
        "engine": "https://github.com/datalab-to/indra",
        "supported_document_types": list(DEFAULT_SCHEMAS.keys())
    }

@app.get("/health")
def health():
    converter = get_indra_converter()
    return {
        "status": "ok",
        "indra_loaded": converter is not None and converter is not False,
        "supported_document_types": list(DEFAULT_SCHEMAS.keys())
    }

@app.get("/api/ocr/default-schemas", response_model=Dict[str, DocumentTypeSchema])
def get_default_schemas():
    """Returns standard extraction schemas and field rules for all supported document types."""
    return DEFAULT_SCHEMAS

@app.post("/api/ocr/extract", response_model=ExtractionResponse)
async def extract_document(
    file: UploadFile = File(...),
    document_type: str = Form("passport"),
    schema: Optional[str] = Form(None)
):
    """
    Extracts text, layout, and structured fields from an uploaded document image or PDF.
    Based on the document_type and optional custom extraction schema.
    """
    start_time = time.time()

    # Parse optional custom schema rules
    custom_rules: Optional[List[FieldRule]] = None
    if schema:
        try:
            raw_rules = json.loads(schema)
            if isinstance(raw_rules, list):
                custom_rules = [FieldRule(**r) for r in raw_rules]
        except (json.JSONDecodeError, ValidationError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid schema specification: {e}")

    # Save uploaded file to temp directory
    suffix = os.path.splitext(file.filename or "")[1] or ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        shutil.copyfileobj(file.file, tmp)

    try:
        # Run Indra OCR
        raw_text, markdown, layout = run_indra_ocr(tmp_path)

        # If OCR text is blank (e.g. running mock or basic stub), generate friendly structural text
        if not raw_text and not markdown:
            markdown = f"# Extracted Document ({file.filename})\n\nDocument type: {document_type}"
            raw_text = markdown

        # Extract fields based on document_type and rules
        fields = extract_fields_with_schema(
            raw_text=raw_text,
            markdown=markdown,
            document_type=document_type,
            schema_rules=custom_rules
        )

        exec_time = (time.time() - start_time) * 1000

        return ExtractionResponse(
            status="completed",
            document_type=document_type,
            raw_text=raw_text,
            markdown=markdown,
            fields=fields,
            layout=layout,
            execution_time_ms=round(exec_time, 2),
            ocr_engine="indra-ocr",
            metadata={
                "filename": file.filename,
                "content_type": file.content_type,
                "file_size": os.path.getsize(tmp_path)
            }
        )

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/ocr/convert")
async def convert_document(file: UploadFile = File(...)):
    """
    Raw Indra OCR conversion to Markdown and layout blocks.
    """
    start_time = time.time()
    suffix = os.path.splitext(file.filename or "")[1] or ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        shutil.copyfileobj(file.file, tmp)

    try:
        raw_text, markdown, layout = run_indra_ocr(tmp_path)
        exec_time = (time.time() - start_time) * 1000

        return {
            "status": "completed",
            "markdown": markdown,
            "raw_text": raw_text,
            "layout": layout,
            "execution_time_ms": round(exec_time, 2),
            "ocr_engine": "indra-ocr"
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
