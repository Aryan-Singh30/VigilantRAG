import io
import pypdf
import docx
import openpyxl

def parse_pdf(file_bytes: bytes) -> str:
    """Extracts text from PDF bytes."""
    text_content = []
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_content.append(text)
    except Exception as e:
        raise ValueError(f"Failed to parse PDF: {str(e)}")
    return "\n\n".join(text_content)

def parse_docx(file_bytes: bytes) -> str:
    """Extracts text from DOCX bytes."""
    text_content = []
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        for para in doc.paragraphs:
            if para.text.strip():
                text_content.append(para.text)
    except Exception as e:
        raise ValueError(f"Failed to parse DOCX: {str(e)}")
    return "\n".join(text_content)

def parse_xlsx(file_bytes: bytes) -> str:
    """Extracts text from XLSX bytes row-by-row."""
    text_content = []
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        for sheet in wb.worksheets:
            text_content.append(f"--- Sheet: {sheet.title} ---")
            for row in sheet.iter_rows(values_only=True):
                row_str = " | ".join([str(val) for val in row if val is not None])
                if row_str.strip():
                    text_content.append(row_str)
    except Exception as e:
        raise ValueError(f"Failed to parse XLSX: {str(e)}")
    return "\n".join(text_content)

def parse_txt(file_bytes: bytes) -> str:
    """Decodes plain text bytes to string."""
    try:
        return file_bytes.decode("utf-8", errors="ignore")
    except Exception as e:
        raise ValueError(f"Failed to parse TXT: {str(e)}")

def parse_file(filename: str, file_bytes: bytes) -> str:
    """Detects file extension and routes to appropriate parser."""
    ext = filename.lower().split(".")[-1]
    if ext == "pdf":
        return parse_pdf(file_bytes)
    elif ext in ["docx", "doc"]:
        return parse_docx(file_bytes)
    elif ext in ["xlsx", "xls"]:
        return parse_xlsx(file_bytes)
    elif ext == "txt":
        return parse_txt(file_bytes)
    else:
        return parse_txt(file_bytes)