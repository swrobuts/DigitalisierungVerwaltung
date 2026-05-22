from pathlib import Path

from pruefung.doctree_build import build_tree, extract_text_blocks


def test_build_tree_from_blocks_simple():
    blocks = [
        {"text": "§ 1 Geltungsbereich", "size": 14, "page": 1},
        {"text": "Die Richtlinie gilt für ...", "size": 11, "page": 1},
        {"text": "§ 2 Begriffsbestimmungen", "size": 14, "page": 2},
        {"text": "§ 2.1 Altentagesstätte", "size": 12, "page": 2},
        {"text": "Eine Altentagesstätte ist eine Einrichtung der offenen Altenhilfe.", "size": 11, "page": 2},
    ]
    tree = build_tree(blocks)
    assert tree["title"] == "AHP-Förderrichtlinie"
    assert len(tree["children"]) == 2

    sec1 = tree["children"][0]
    assert sec1["path"] == "§ 1"
    assert "Geltungsbereich" in sec1["title"]
    assert "gilt für" in sec1["content"]

    sec2 = tree["children"][1]
    assert sec2["path"] == "§ 2"
    assert len(sec2["children"]) == 1
    assert sec2["children"][0]["path"] == "§ 2.1"
    assert "Einrichtung der offenen Altenhilfe" in sec2["children"][0]["content"]


def test_build_tree_leerer_input_returnt_nur_root():
    tree = build_tree([])
    assert tree["title"] == "AHP-Förderrichtlinie"
    assert tree["children"] == []


def test_section_id_stable_und_paths_basiert():
    blocks = [{"text": "§ 4.2.1 Mietkosten", "size": 12, "page": 1}]
    tree = build_tree(blocks)
    sec = tree["children"][0]["children"][0]["children"][0]
    assert sec["id"] == "sec_4_2_1"
    assert sec["path"] == "§ 4.2.1"
    assert sec["level"] == 3


def test_integration_extract_und_build_from_mini_pdf():
    pdf_path = Path(__file__).parent / "fixtures" / "mini.pdf"
    blocks = extract_text_blocks(pdf_path)
    tree = build_tree(blocks)
    paths = [c["path"] for c in tree["children"]]
    assert "§ 1" in paths
    assert "§ 2" in paths
