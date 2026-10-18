import re
import os
import time
import json
import subprocess
from typing import Dict, Any, List, Optional, Tuple
from schemas import FieldRule, ExtractedField, DEFAULT_SCHEMAS

# Attempt to load indra_ocr natively if available
_indra_model = None

def get_indra_converter():
    global _indra_model
    if _indra_model is None:
        try:
            import indra_ocr
            _indra_model = indra_ocr.load()
        except Exception as e:
            # Will fall back to CLI or robust textual parsing
            _indra_model = False
    return _indra_model

def run_indra_ocr(file_path: str) -> Tuple[str, str, List[Dict[str, Any]]]:
    """
    Runs Indra OCR on the given file path.
    Returns: (raw_text, markdown, layout_blocks)
    """
    converter = get_indra_converter()
    raw_text = ""
    markdown = ""
    layout = []

    # 1. Try python module directly
    if converter and converter is not False:
        try:
            res = converter.convert(file_path)
            if hasattr(res, "markdown"):
                markdown = res.markdown
            elif isinstance(res, str):
                markdown = res
            if hasattr(res, "text"):
                raw_text = res.text
            elif hasattr(res, "raw_text"):
                raw_text = res.raw_text
            else:
                raw_text = markdown
            if hasattr(res, "layout"):
                layout = res.layout
            elif hasattr(res, "blocks"):
                layout = res.blocks
            if raw_text and markdown:
                return raw_text, markdown, layout
        except Exception as err:
            print(f"[indra-ocr] Python module conversion warning: {err}")

    # 2. Try CLI `indra-ocr` command
    try:
        proc = subprocess.run(
            ["indra-ocr", file_path, "--format", "json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30
        )
        if proc.returncode == 0 and proc.stdout.strip():
            try:
                parsed = json.loads(proc.stdout)
                markdown = parsed.get("markdown", "")
                raw_text = parsed.get("text", parsed.get("raw_text", markdown))
                layout = parsed.get("layout", parsed.get("blocks", []))
                return raw_text, markdown, layout
            except json.JSONDecodeError:
                markdown = proc.stdout
                raw_text = proc.stdout
                return raw_text, markdown, layout
    except Exception as err:
        pass

    # 3. Fallback: Read file with basic image / pdf fallback if indra binary is still compiling
    # For images or text files, extract text safely
    try:
        from PIL import Image
        img = Image.open(file_path)
        # Generate basic layout descriptor
        layout.append({
            "type": "page",
            "width": img.width,
            "height": img.height
        })
    except Exception:
        pass

    return raw_text, markdown, layout


def extract_fields_with_schema(
    raw_text: str,
    markdown: str,
    document_type: str,
    schema_rules: Optional[List[FieldRule]] = None
) -> Dict[str, ExtractedField]:
    """
    Extracts structured fields matching the document type and provided schema rules.
    """
    # Merge provided rules with default rules
    rules: List[FieldRule] = []
    if schema_rules:
        rules.extend(schema_rules)
    
    # If standard document type exists, add default rules for missing keys
    default_schema = DEFAULT_SCHEMAS.get(document_type.lower())
    if default_schema:
        existing_keys = {r.key for r in rules}
        for def_rule in default_schema.fields:
            if def_rule.key not in existing_keys:
                rules.append(def_rule)

    combined_text = (raw_text + "\n" + markdown).strip()
    lines = [l.strip() for l in combined_text.splitlines() if l.strip()]

    extracted: Dict[str, ExtractedField] = {}

    # Check for MRZ lines (Passports / travel documents)
    mrz_lines = [l for l in lines if re.match(r'^[A-Z0-9<]{30,}$', l)]
    mrz_data = parse_mrz(mrz_lines) if len(mrz_lines) >= 2 else {}

    for rule in rules:
        val: Optional[str] = None
        conf = 0.8
        src_line: Optional[str] = None

        # 1. First check MRZ if applicable
        if rule.key in mrz_data and mrz_data[rule.key]:
            val = mrz_data[rule.key]
            conf = 0.98
            src_line = "MRZ Machine Readable Zone"

        # 2. Check explicit regex pattern if defined
        if not val and rule.pattern:
            try:
                rx = re.compile(rule.pattern, re.IGNORECASE)
                match = rx.search(combined_text)
                if match:
                    val = match.group(1) if match.groups() else match.group(0)
                    conf = 0.92
                    # Find matching line
                    for line in lines:
                        if val in line:
                            src_line = line
                            break
            except re.error:
                pass

        # 3. Apply semantic extractors based on rule key or type
        if not val:
            val, conf, src_line = extract_by_semantics(rule, lines, combined_text)

        # 4. Key-Value heuristic lookup (e.g. "Label: Value" or "Key: Value")
        if not val:
            val, conf, src_line = extract_by_label_heuristic(rule, lines)

        # Clean value if found
        if val:
            val = clean_field_value(val)

        extracted[rule.key] = ExtractedField(
            key=rule.key,
            label=rule.label,
            value=val,
            confidence=round(conf, 2) if val else 0.0,
            source_line=src_line,
            valid=bool(val) or not rule.required
        )

    return extracted


def extract_by_semantics(rule: FieldRule, lines: List[str], text: str) -> Tuple[Optional[str], float, Optional[str]]:
    """Specialized extraction for dates, document numbers, names, addresses, and monetary amounts."""
    key = rule.key.lower()
    rtype = rule.type.lower()

    # Dates
    if "dob" in key or "birth" in key:
        m_exact = re.search(r'\b(\d{2}/\d{2}/\d{4})\b', text)
        if m_exact:
            return m_exact.group(1).strip(), 0.98, m_exact.group(0)
        m = re.search(r'(?:dob|date of birth|born|birth date)[:\s]+([\d]{1,2}[\s/.-][\w]{2,3}[\s/.-][\d]{2,4})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.92, m.group(0)
    elif "expiry" in key or "expires" in key or "valid_until" in key:
        m = re.search(r'(?:expiry|expires?|valid until|exp date)[:\s]+([\d]{1,2}[\s/.-][\w]{2,3}[\s/.-][\d]{2,4})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.92, m.group(0)
    elif "issue" in key:
        m = re.search(r'(?:issue date|issued|date of issue)[:\s]+([\d]{1,2}[\s/.-][\w]{2,3}[\s/.-][\d]{2,4})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.90, m.group(0)

    # Document / License / ID Numbers
    if key in ["document_number", "license_number", "id_number", "tax_id", "pan_number"]:
        pan = re.search(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', text)
        if pan:
            return pan.group(1), 0.99, pan.group(0)
        m = re.search(r'(?:passport\s*no|document\s*no|license\s*no|id\s*no|ssn|tin|number)[:\s#]*([A-Z0-9-]{6,16})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.91, m.group(0)

    # Father's Name
    if "father" in key:
        father_idx = -1
        for i, l in enumerate(lines):
            if re.search(r"(?:father's name|father|पिता)", l, re.IGNORECASE):
                father_idx = i
                break
        if father_idx != -1:
            noise = {'HARE', 'HERE', 'ELST', 'EABOS', 'NAME', 'CARD', 'INDIA', 'GOVT', 'INCOME', 'TAX', 'DEPARTMENT', 'FATHER', 'DATE', 'BIRTH'}
            for i in range(father_idx + 1, min(len(lines), father_idx + 4)):
                cleaned = re.sub(r'^[^a-zA-Z]+', '', lines[i]).strip()
                words = [re.sub(r'[^a-zA-Z]', '', w) for w in cleaned.split()]
                valid = [w for w in words if w == w.upper() and w not in noise and len(w) >= 3]
                if len(valid) >= 2:
                    return " ".join(valid), 0.95, lines[i]

    # Full Name / Applicant Name
    if key in ["full_name", "name", "applicant_name"]:
        pan_idx = -1
        father_idx = -1
        for i, l in enumerate(lines):
            if re.search(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b', l) and pan_idx == -1:
                pan_idx = i
            if re.search(r"(?:father's name|father|पिता)", l, re.IGNORECASE) and father_idx == -1:
                father_idx = i
        if pan_idx != -1:
            end_search = father_idx if father_idx != -1 else len(lines)
            noise = {'HARE', 'HERE', 'ELST', 'EABOS', 'NAME', 'CARD', 'INDIA', 'GOVT', 'INCOME', 'TAX', 'DEPARTMENT', 'ACCOUNT', 'NUMBER'}
            for i in range(pan_idx + 1, end_search):
                cleaned = re.sub(r'^[^a-zA-Z]+', '', lines[i]).strip()
                words = [re.sub(r'[^a-zA-Z]', '', w) for w in cleaned.split()]
                valid = [w for w in words if w == w.upper() and w not in noise and len(w) >= 3]
                if len(valid) >= 2:
                    return " ".join(valid), 0.96, lines[i]

    # Nationality / Country
    if "nationality" in key or "citizen" in key:
        m = re.search(r'(?:nationality|citizenship|citizen of)[:\s]+([A-Za-z\s]{3,30})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.88, m.group(0)

    # Gender / Sex
    if key in ["gender", "sex"]:
        m = re.search(r'(?:sex|gender)[:\s]+([MFX]|male|female)', text, re.IGNORECASE)
        if m:
            g = m.group(1).upper()
            return ("Male" if g in ["M", "MALE"] else "Female" if g in ["F", "FEMALE"] else g), 0.95, m.group(0)

    # Amount / Financial
    if rtype == "number" or "amount" in key or "balance" in key:
        m = re.search(r'(?:amount due|total|balance|closing balance|due)[:\s]*([\$€£]?\s*[\d,]+\.\d{2})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.89, m.group(0)

    # Email
    if rtype == "email" or "email" in key:
        m = re.search(r'\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b', text)
        if m:
            return m.group(1).strip(), 0.98, m.group(0)

    # Phone
    if rtype == "phone" or "phone" in key or "mobile" in key:
        m = re.search(r'(?:(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{10,14})', text)
        if m:
            return m.group(0).strip(), 0.94, m.group(0)

    # LinkedIn / GitHub URLs
    if "linkedin" in key:
        m = re.search(r'(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+', text, re.IGNORECASE)
        if m:
            return m.group(0).strip(), 0.98, m.group(0)
    if "github" in key:
        m = re.search(r'(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+', text, re.IGNORECASE)
        if m:
            return m.group(0).strip(), 0.98, m.group(0)

    # Candidate Name (Resumes)
    if key == "candidate_name":
        for line in lines[:5]:
            words = line.strip().split()
            if 2 <= len(words) <= 4 and not re.search(r'(?:resume|cv|curriculum|vitae|page|email|phone|contact)', line, re.IGNORECASE):
                if not re.search(r'[@\d]', line):
                    return line.strip(), 0.92, line

    # Current Role / Job Title
    if "role" in key or "title" in key or "position" in key:
        for line in lines[:8]:
            if re.search(r'(?:software|developer|engineer|scientist|analyst|manager|director|lead|consultant|architect|designer|specialist)', line, re.IGNORECASE):
                return line.strip(), 0.85, line

    # Skills
    if "skill" in key:
        m = re.search(r'(?:technical\s*skills?|core\s*competencies|skills?)[:\s]+([^\n\r]+)', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.90, m.group(0)

    # Education
    if "education" in key or "degree" in key:
        for line in lines:
            if re.search(r'\b(?:bachelor|master|ph\.?d|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|degree|university|college|institute)\b', line, re.IGNORECASE):
                return line.strip(), 0.88, line

    # Years of Experience
    if "experience" in key or "exp" in key:
        m = re.search(r'(\d+(?:\.\d+)?)\+?\s*years?(?:\s+of)?\s+experience', text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.92, m.group(0)

    # Address
    if rtype == "address" or "address" in key:
        for i, line in enumerate(lines):
            if re.search(r'\b(?:street|st\.|ave|avenue|blvd|road|rd\.|drive|dr\.|lane|ln\.|way|suite|apt)\b', line, re.IGNORECASE):
                # Grab this line plus next line if it looks like city/state/zip
                val = line
                if i + 1 < len(lines) and re.search(r'\b[A-Z]{2}\b|\b\d{5}\b', lines[i + 1]):
                    val += ", " + lines[i + 1]
                return val, 0.85, line

    return None, 0.0, None


def extract_by_label_heuristic(rule: FieldRule, lines: List[str]) -> Tuple[Optional[str], float, Optional[str]]:
    """Matches label or key prefix on lines (e.g. 'Surname: Smith', 'Account Number: 12345678')."""
    candidates = [
        re.escape(rule.label),
        re.escape(rule.key),
        re.escape(rule.key.replace("_", " "))
    ]
    pattern = rf'^(?:{"|".join(candidates)})[:\s-]+(.+)$'

    for line in lines:
        m = re.search(pattern, line, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            if val and len(val) > 1:
                return val, 0.84, line

    return None, 0.0, None


def parse_mrz(lines: List[str]) -> Dict[str, str]:
    """Parses ICAO 9303 Doc 9303 MRZ lines for Passports (TD3)."""
    res: Dict[str, str] = {}
    try:
        line1 = lines[0].padEnd(44, '<') if hasattr(lines[0], 'padEnd') else lines[0].ljust(44, '<')
        line2 = lines[1].padEnd(44, '<') if hasattr(lines[1], 'padEnd') else lines[1].ljust(44, '<')

        # Full MRZ
        res["mrz"] = f"{line1}\n{line2}"

        # Line 1: Surname and Given Names
        name_part = line1[5:].replace('<', ' ').strip()
        names = name_part.split('  ')
        if len(names) >= 1 and names[0]:
            res["last_name"] = names[0].strip()
        if len(names) >= 2 and names[1]:
            res["first_name"] = names[1].strip()
        if "first_name" in res and "last_name" in res:
            res["full_name"] = f"{res['first_name']} {res['last_name']}"

        # Line 2: Document Number (0-8)
        doc_num = line2[0:9].replace('<', '').strip()
        if doc_num:
            res["document_number"] = doc_num

        # Nationality (10-12)
        nat = line2[10:13].replace('<', '').strip()
        if nat:
            res["nationality"] = nat

        # Date of Birth (13-18: YYMMDD)
        dob_raw = line2[13:19]
        if dob_raw.isdigit():
            y = int(dob_raw[0:2])
            m = dob_raw[2:4]
            d = dob_raw[4:6]
            full_year = (1900 + y) if y > 30 else (2000 + y)
            res["dob"] = f"{d}/{m}/{full_year}"

        # Sex (20)
        sex = line2[20].upper()
        if sex in ['M', 'F']:
            res["gender"] = "Male" if sex == 'M' else "Female"

        # Expiration (21-26: YYMMDD)
        exp_raw = line2[21:27]
        if exp_raw.isdigit():
            y = int(exp_raw[0:2])
            m = exp_raw[2:4]
            d = exp_raw[4:6]
            res["expiry_date"] = f"{d}/{m}/{2000 + y}"

    except Exception as e:
        print(f"[MRZ Parse] error: {e}")

    return res


def clean_field_value(val: str) -> str:
    """Strip extraneous quotation marks, trailing colons or separators."""
    val = val.strip().strip("'\"`")
    if val.startswith(":") or val.startswith("-"):
        val = val[1:].strip()
    return val
