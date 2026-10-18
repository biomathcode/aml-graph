"""
Unit tests for Indra OCR schema extraction and parsing logic
"""
from schemas import FieldRule, DEFAULT_SCHEMAS
from extractor import extract_fields_with_schema, parse_mrz

def test_passport_mrz_extraction():
    mrz_lines = [
        "P<GBRSMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897GBR9001018M3001014<<<<<<<<<<<<<<02"
    ]
    parsed = parse_mrz(mrz_lines)
    assert parsed["first_name"] == "JOHN"
    assert parsed["last_name"] == "SMITH"
    assert parsed["document_number"] == "123456789"
    assert parsed["nationality"] == "GBR"
    assert parsed["gender"] == "Male"
    assert parsed["dob"] == "01/01/1990"
    assert parsed["expiry_date"] == "01/01/2030"

def test_custom_schema_rules():
    sample_text = """
    TAX INVOICE / STATEMENT
    Invoice Number: INV-98765
    Due Date: 15/12/2026
    Total Amount: $1,450.50
    Customer Account: ACCT-44321
    """
    custom_rules = [
        FieldRule(key="invoice_no", label="Invoice Number", type="regex", pattern=r"INV-\d+"),
        FieldRule(key="total_amount", label="Total Amount", type="number", pattern=r"\$[\d,]+\.\d{2}"),
        FieldRule(key="customer_acc", label="Customer Account", type="string")
    ]
    extracted = extract_fields_with_schema(sample_text, "", "custom", custom_rules)
    assert extracted["invoice_no"].value == "INV-98765"
    assert extracted["total_amount"].value == "$1,450.50"
    assert extracted["customer_acc"].value == "ACCT-44321"

if __name__ == "__main__":
    test_passport_mrz_extraction()
    test_custom_schema_rules()
    print("All extraction tests passed!")
