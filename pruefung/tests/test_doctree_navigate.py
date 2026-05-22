from pruefung.doctree_navigate import get_section, list_sections, search_tree

TREE = {
    "id": "root",
    "title": "AHP",
    "path": "",
    "level": 0,
    "content": "",
    "children": [
        {"id": "sec_1", "title": "§ 1 Geltung", "path": "§ 1", "level": 1,
         "content": "Diese Richtlinie regelt die Förderung von Altentagesstätten.", "children": []},
        {"id": "sec_4", "title": "§ 4 Förderung", "path": "§ 4", "level": 1, "content": "", "children": [
            {"id": "sec_4_2", "title": "§ 4.2 Miete", "path": "§ 4.2", "level": 2,
             "content": "Mietkosten bis 12000 Euro pro Jahr.", "children": []},
        ]},
    ],
}


def test_list_sections_root():
    items = list_sections(TREE, "root")
    assert len(items) == 2
    assert items[0]["path"] == "§ 1"
    assert "content" not in items[0]  # kompakt, nur Meta


def test_list_sections_nested():
    items = list_sections(TREE, "sec_4")
    assert len(items) == 1
    assert items[0]["path"] == "§ 4.2"


def test_list_sections_unknown_parent_empty():
    assert list_sections(TREE, "nope") == []


def test_get_section_returns_content():
    sec = get_section(TREE, "sec_4_2")
    assert sec is not None
    assert "12000" in sec["content"]


def test_get_section_not_found_returns_none():
    assert get_section(TREE, "sec_99") is None


def test_search_finds_keyword_in_content():
    hits = search_tree(TREE, "Mietkosten")
    assert any(h["id"] == "sec_4_2" for h in hits)


def test_search_case_insensitive():
    hits = search_tree(TREE, "mietkosten")
    assert any(h["id"] == "sec_4_2" for h in hits)


def test_search_empty_query_returns_empty():
    assert search_tree(TREE, "") == []


def test_search_finds_title_match():
    hits = search_tree(TREE, "Förderung")
    assert any(h["id"] == "sec_4" for h in hits)


def test_search_limits_max_results():
    big_tree = {
        "id": "root", "title": "X", "path": "", "level": 0, "content": "",
        "children": [
            {"id": f"sec_{i}", "title": f"§ {i} X", "path": f"§ {i}", "level": 1,
             "content": "treffer", "children": []}
            for i in range(1, 11)
        ],
    }
    hits = search_tree(big_tree, "treffer", max_results=3)
    assert len(hits) == 3
