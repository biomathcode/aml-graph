from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

FieldDataType = Literal["string", "date", "number", "regex", "address", "name", "email", "phone"]

class FieldRule(BaseModel):
    key: str = Field(..., description="Unique key for the field (e.g. 'document_number', 'dob')")
    label: str = Field(..., description="Human readable label (e.g. 'Document Number')")
    type: FieldDataType = Field("string", description="Expected data type")
    pattern: Optional[str] = Field(None, description="Regex pattern or keyword pattern for extraction")
    description: Optional[str] = Field(None, description="Description or context keywords")
    required: bool = Field(False, description="Whether this field is mandatory")

class DocumentTypeSchema(BaseModel):
    document_type: str
    title: str
    description: str
    fields: List[FieldRule]

class ExtractedField(BaseModel):
    key: str
    label: str
    value: Optional[str] = None
    confidence: float = 1.0
    source_line: Optional[str] = None
    valid: bool = True

class ExtractionResponse(BaseModel):
    status: str = "completed"
    document_type: str
    raw_text: str
    markdown: str
    fields: Dict[str, ExtractedField]
    layout: List[Dict[str, Any]] = []
    execution_time_ms: float
    ocr_engine: str = "indra-ocr"
    metadata: Dict[str, Any] = {}

# Default schemas per document type
DEFAULT_SCHEMAS: Dict[str, DocumentTypeSchema] = {
    "passport": DocumentTypeSchema(
        document_type="passport",
        title="International Passport",
        description="Machine-readable travel documents and national passports.",
        fields=[
            FieldRule(key="first_name", label="Given Name(s)", type="name", description="First and middle names"),
            FieldRule(key="last_name", label="Surname", type="name", description="Family name / surname"),
            FieldRule(key="document_number", label="Passport Number", type="regex", pattern=r"[A-Z0-9]{8,12}", required=True),
            FieldRule(key="nationality", label="Nationality", type="string", description="Citizen state / 3-letter code"),
            FieldRule(key="dob", label="Date of Birth", type="date", pattern=r"\d{1,2}[-/\s][A-Za-z0-9]{2,3}[-/\s]\d{2,4}"),
            FieldRule(key="gender", label="Sex", type="string", description="M / F / X / Male / Female"),
            FieldRule(key="expiry_date", label="Date of Expiry", type="date"),
            FieldRule(key="issuing_state", label="Issuing Country / Authority", type="string"),
            FieldRule(key="mrz", label="Machine Readable Zone (MRZ)", type="string", description="2 or 3 lines of OCR code"),
        ]
    ),
    "driving_license": DocumentTypeSchema(
        document_type="driving_license",
        title="Driver's License",
        description="State or national motor vehicle operator licenses.",
        fields=[
            FieldRule(key="first_name", label="First Name", type="name"),
            FieldRule(key="last_name", label="Last Name", type="name"),
            FieldRule(key="license_number", label="License / DL Number", type="regex", pattern=r"[A-Z0-9-]{6,16}", required=True),
            FieldRule(key="dob", label="Date of Birth", type="date"),
            FieldRule(key="issue_date", label="Issue Date", type="date"),
            FieldRule(key="expiry_date", label="Expiration Date", type="date"),
            FieldRule(key="address", label="Residential Address", type="address"),
            FieldRule(key="vehicle_class", label="License Class / Endorsements", type="string"),
        ]
    ),
    "national_id": DocumentTypeSchema(
        document_type="national_id",
        title="National Identity Card",
        description="Government-issued citizen identification cards.",
        fields=[
            FieldRule(key="full_name", label="Full Name", type="name", required=True),
            FieldRule(key="id_number", label="National ID Number", type="regex", pattern=r"[A-Z0-9-]{6,18}", required=True),
            FieldRule(key="father_name", label="Father's Name", type="name"),
            FieldRule(key="dob", label="Date of Birth", type="date"),
            FieldRule(key="nationality", label="Nationality", type="string"),
            FieldRule(key="address", label="Address", type="address"),
            FieldRule(key="issue_date", label="Date of Issue", type="date"),
            FieldRule(key="expiry_date", label="Date of Expiry", type="date"),
        ]
    ),
    "pan_card": DocumentTypeSchema(
        document_type="pan_card",
        title="Indian PAN Card",
        description="Permanent Account Number Card issued by the Income Tax Department of India.",
        fields=[
            FieldRule(key="pan_number", label="Permanent Account Number", type="regex", pattern=r"[A-Z]{5}[0-9]{4}[A-Z]", required=True),
            FieldRule(key="full_name", label="Full Name", type="name", required=True),
            FieldRule(key="father_name", label="Father's Name", type="name"),
            FieldRule(key="dob", label="Date of Birth", type="date", pattern=r"\d{2}/\d{2}/\d{4}"),
        ]
    ),
    "utility_bill": DocumentTypeSchema(
        document_type="utility_bill",
        title="Utility Bill (Proof of Address)",
        description="Electricity, gas, water, or broadband service bills.",
        fields=[
            FieldRule(key="account_holder", label="Account Holder Name", type="name", required=True),
            FieldRule(key="address", label="Service / Billing Address", type="address", required=True),
            FieldRule(key="billing_date", label="Bill Date / Statement Date", type="date"),
            FieldRule(key="due_date", label="Payment Due Date", type="date"),
            FieldRule(key="amount_due", label="Total Amount Due", type="number", pattern=r"[\$€£]?\s*\d+[.,]\d{2}"),
            FieldRule(key="provider", label="Service Provider Name", type="string"),
            FieldRule(key="account_number", label="Account / Customer ID", type="string"),
        ]
    ),
    "bank_statement": DocumentTypeSchema(
        document_type="bank_statement",
        title="Bank Statement",
        description="Official bank or financial institution account statements.",
        fields=[
            FieldRule(key="account_holder", label="Account Holder Name", type="name", required=True),
            FieldRule(key="account_number", label="Account Number / IBAN", type="string", required=True),
            FieldRule(key="bank_name", label="Financial Institution / Bank", type="string"),
            FieldRule(key="statement_period", label="Statement Period", type="string"),
            FieldRule(key="closing_balance", label="Ending / Closing Balance", type="number"),
            FieldRule(key="address", label="Customer Address", type="address"),
        ]
    ),
    "tax_form": DocumentTypeSchema(
        document_type="tax_form",
        title="Tax Return / Assessment",
        description="W-2, 1099, P60, or government tax assessment filings.",
        fields=[
            FieldRule(key="taxpayer_name", label="Taxpayer Name", type="name", required=True),
            FieldRule(key="tax_id", label="Tax Identification Number (TIN / SSN / EIN)", type="regex", pattern=r"\d{3}-?\d{2}-?\d{4}|\d{9}", required=True),
            FieldRule(key="tax_year", label="Tax Year", type="number", pattern=r"20\d{2}"),
            FieldRule(key="gross_income", label="Gross Income / Earnings", type="number"),
            FieldRule(key="filing_status", label="Filing Status", type="string"),
        ]
    ),
    "resume": DocumentTypeSchema(
        document_type="resume",
        title="Resume / Curriculum Vitae (CV)",
        description="Professional candidate resume, CV, or employment history document.",
        fields=[
            FieldRule(key="candidate_name", label="Candidate Name", type="name", required=True),
            FieldRule(key="email", label="Email Address", type="email", pattern=r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", required=True),
            FieldRule(key="phone", label="Phone Number", type="phone", pattern=r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
            FieldRule(key="current_role", label="Current / Recent Title", type="string"),
            FieldRule(key="skills", label="Skills & Competencies", type="string"),
            FieldRule(key="education", label="Education / Degree", type="string"),
            FieldRule(key="location", label="Location / City", type="address"),
            FieldRule(key="experience_years", label="Experience (Years)", type="number"),
            FieldRule(key="linkedin_url", label="LinkedIn Profile", type="string", pattern=r"(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+"),
            FieldRule(key="github_url", label="GitHub Profile", type="string", pattern=r"(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+"),
        ]
    ),
    "custom": DocumentTypeSchema(
        document_type="custom",
        title="Custom Document",
        description="User-defined document extraction with custom fields.",
        fields=[
            FieldRule(key="document_title", label="Document Title", type="string"),
            FieldRule(key="reference_number", label="Reference / ID Number", type="string"),
            FieldRule(key="date", label="Document Date", type="date"),
            FieldRule(key="parties", label="Parties Involved", type="string"),
        ]
    )
}
