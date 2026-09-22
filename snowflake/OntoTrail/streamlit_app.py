import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime

import streamlit as st
from snowflake.snowpark.context import get_active_session

st.set_page_config(
    page_title="OntoTrail",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="expanded",
)

DB = "ONTOTRAIL"
SCHEMA = "SUPPLY_CHAIN"
TABLE = f"{DB}.{SCHEMA}.COCO_DEMO_ORDERS"
SEMANTIC_VIEW = f"{DB}.{SCHEMA}.ONTOTRAIL_COCO_ANALYST"
ANALYST_ENDPOINT = "/api/v2/cortex/analyst/message"

SCENARIOS = {
    "Baseline": "BASELINE",
    "Aruna +4d": "ARUNA_4D",
    "Aruna +4d recovery": "ARUNA_4D_RECOVERY",
}

SCENARIO_SENSITIVE = re.compile(
    r"\b(exposure|risk|delay|late|shortage|inventory|days of inventory|fill rate|"
    r"on[- ]?time|otd|recovery|landed cost|cost|order value|affected|impact|"
    r"disruption|mitigation)\b",
    re.I,
)

st.markdown(
    """
    <style>
      :root { --ot-teal:#0d8977; --ot-navy:#102f4a; --ot-bg:#f5f8fa; --ot-border:#dce6eb; }
      .stApp { background: var(--ot-bg); color: var(--ot-navy); }
      section[data-testid="stSidebar"] { background:#102f4a; }
      section[data-testid="stSidebar"] * { color:#edf7f8; }
      section[data-testid="stSidebar"] .stButton > button {
        width:100%; border-radius:10px; border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06); color:#f5fbfc;
      }
      section[data-testid="stSidebar"] .stButton > button:hover {
        background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.25);
      }
      .ot-brand { display:flex; align-items:center; gap:10px; padding:4px 0 14px; }
      .ot-mark {
        width:42px; height:42px; border-radius:12px; background:white; color:#0d8977;
        display:grid; place-items:center; font-weight:900; font-size:21px;
      }
      .ot-brand h2 { margin:0; color:white; font-size:22px; }
      .ot-brand p { margin:2px 0 0; color:#a9c4cf; font-size:11px; }
      .ot-live {
        display:inline-block; border:1px solid #b7e5da; background:#effaf7; color:#087665;
        border-radius:999px; padding:5px 10px; font-size:10px; letter-spacing:.08em;
      }
      .ot-reco {
        padding:14px 16px; border-radius:12px; border:1px solid #cce7df; background:#f2fbf7;
        color:#315d55;
      }
      .ot-title { margin-bottom:2px; }
      .ot-subtitle { color:#728694; margin-bottom:18px; }
      [data-testid="stMetric"] {
        background:white; border:1px solid var(--ot-border); border-radius:14px; padding:12px 14px;
      }
      .block-container { padding-top:1.2rem; padding-bottom:2rem; }
    </style>
    """,
    unsafe_allow_html=True,
)

session = get_active_session()


def rows_from_query(sql: str):
    return [row.as_dict() for row in session.sql(sql).collect()]


def get_session_token() -> str:
    token_path = "/snowflake/session/token"
    if not os.path.exists(token_path):
        raise RuntimeError("Snowflake container session token is not available.")
    with open(token_path, "r", encoding="utf-8") as f:
        return f.read().strip()


def clean_sql(sql: str) -> str:
    sql = (sql or "").strip().rstrip(";")
    if not re.match(r"^(select|with)\b", sql, re.I):
        return ""
    if re.search(r";\s*\S", sql):
        return ""
    if re.search(r"\b(insert|update|delete|merge|alter|drop|create|truncate|grant|revoke|call|copy)\b", sql, re.I):
        return ""
    return sql


def normalize_analyst_response(body: dict) -> dict:
    content = (body.get("message") or {}).get("content") or []
    texts = [x.get("text", "") for x in content if x.get("type") == "text" and x.get("text")]
    sql = next((x.get("statement", "") for x in content if x.get("type") == "sql"), "")
    suggestions = []
    for x in content:
        if x.get("type") == "suggestions":
            suggestions.extend(x.get("suggestions") or [])
    return {
        "text": "\n\n".join(texts).strip(),
        "sql": clean_sql(sql),
        "suggestions": suggestions[:6],
        "request_id": body.get("request_id", ""),
    }


def contextualize_question(question: str, scenario: str) -> str:
    q = question.strip()
    if re.search(r"\b(BASELINE|ARUNA_4D|ARUNA_4D_RECOVERY)\b", q, re.I):
        return q
    if not SCENARIO_SENSITIVE.search(q):
        return q
    return f"{q} Use scenario {scenario}."


def ask_cortex(question: str, scenario: str) -> dict:
    host = os.getenv("SNOWFLAKE_HOST")
    if not host:
        raise RuntimeError("SNOWFLAKE_HOST is not available in this runtime.")
    url = f"https://{host}{ANALYST_ENDPOINT}"
    payload = {
        "messages": [{
            "role": "user",
            "content": [{"type": "text", "text": contextualize_question(question, scenario)}],
        }],
        "semantic_view": SEMANTIC_VIEW,
        "stream": False,
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {get_session_token()}",
            "X-Snowflake-Authorization-Token-Type": "OAUTH",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw)
            message = body.get("message") or body.get("error") or raw
        except Exception:
            message = raw
        raise RuntimeError(f"Cortex Analyst returned {exc.code}: {message}") from exc

    parsed = normalize_analyst_response(body)
    parsed["data"] = rows_from_query(parsed["sql"]) if parsed["sql"] else []
    return parsed


def number(value):
    try:
        return float(value)
    except Exception:
        return None


def fmt_metric(col: str, value) -> str:
    n = number(value)
    if n is None:
        return str(value)
    key = str(col).upper()
    if any(k in key for k in ["INR", "EXPOSURE", "VALUE", "REVENUE", "COST", "AMOUNT"]):
        if abs(n) >= 10_000_000:
            return f"₹{n/10_000_000:.2f} crore"
        if abs(n) >= 100_000:
            return f"₹{n/100_000:.2f} lakh"
        return f"₹{n:,.0f}"
    if any(k in key for k in ["PCT", "PERCENT", "RATE"]):
        return f"{n:.2f}%"
    if "DAY" in key:
        return f"{n:.2f} days"
    if any(k in key for k in ["COUNT", "QUANTITY", "UNITS"]):
        return f"{n:,.0f}"
    return f"{n:,.2f}"


def analyst_model(rows):
    if not rows:
        return None, None
    columns = list(rows[0].keys())
    numeric_cols = [c for c in columns if any(number(r.get(c)) is not None for r in rows)]
    dims = [c for c in columns if c not in numeric_cols]
    metric = next((c for c in numeric_cols if re.search(r"EXPOSURE|VALUE|COST|AMOUNT|COUNT|QUANTITY|UNITS|DAYS|RATE|PERCENT", c, re.I)), numeric_cols[0] if numeric_cols else None)
    dim = next((c for c in dims if "SCENARIO" not in c.upper()), dims[0] if dims else None)
    return dim, metric


def refined_answer(question: str, result: dict) -> str:
    rows = result.get("data") or []
    if not rows:
        return result.get("text") or "No matching records were returned."

    dim, metric = analyst_model(rows)
    if not metric:
        return result.get("text") or f"I found {len(rows)} matching records."

    scenario_col = next((c for c in rows[0].keys() if c.upper() == "SCENARIO"), None)
    if scenario_col and len(rows) >= 2:
        parts = [f"**{r.get(scenario_col)}**: {fmt_metric(metric, r.get(metric))}" for r in rows[:4]]
        text = " · ".join(parts) + "."
        by_scenario = {str(r.get(scenario_col, "")).upper(): r for r in rows}
        if "ARUNA_4D" in by_scenario and "ARUNA_4D_RECOVERY" in by_scenario:
            a = number(by_scenario["ARUNA_4D"].get(metric))
            b = number(by_scenario["ARUNA_4D_RECOVERY"].get(metric))
            if a not in (None, 0) and b is not None:
                delta = a - b
                pct = delta / a * 100
                text += f" Recovery changes {metric.replace('_',' ').lower()} by **{fmt_metric(metric, delta)}** ({pct:.1f}%)."
        return text

    if dim and metric:
        asks_low = bool(re.search(r"\b(lowest|minimum|smallest|least|bottom)\b", question, re.I))
        ordered = sorted(
            [r for r in rows if number(r.get(metric)) is not None],
            key=lambda r: number(r.get(metric)),
            reverse=not asks_low,
        )
        if not ordered:
            return result.get("text") or f"I found {len(rows)} matching records."
        first = ordered[0]
        qualifier = "lowest" if asks_low else ("highest" if re.search(r"\b(highest|maximum|largest|most|top)\b", question, re.I) else "leading")
        text = f"**{first.get(dim)}** has the {qualifier} {metric.replace('_',' ').lower()} at **{fmt_metric(metric, first.get(metric))}**"
        if len(ordered) > 1:
            second = ordered[1]
            text += f", followed by **{second.get(dim)}** at {fmt_metric(metric, second.get(metric))}"
        if len(ordered) > 2 and re.search(r"\b(top|highest|lowest|least|most|rank)\b", question, re.I):
            third = ordered[2]
            text += f" and **{third.get(dim)}** at {fmt_metric(metric, third.get(metric))}"
        return text + "."

    return result.get("text") or f"I found {len(rows)} matching records."


def recommendation(question: str, result: dict) -> str:
    rows = result.get("data") or []
    if not rows:
        return ""
    dim, metric = analyst_model(rows)
    if not dim or not metric:
        return ""
    asks_low = bool(re.search(r"\b(lowest|minimum|smallest|least|bottom)\b", question, re.I))
    ordered = sorted(
        [r for r in rows if number(r.get(metric)) is not None],
        key=lambda r: number(r.get(metric)),
        reverse=not asks_low,
    )
    if not ordered:
        return ""
    item = str(ordered[0].get(dim))
    dim_up = dim.upper()
    if "SUPPLIER" in dim_up:
        return f"Validate alternate sourcing or capacity for **{item}**, then simulate the mitigation before converting the insight into an owned decision."
    if "PLANT" in dim_up:
        return f"Review inbound supply and alternate production capacity for **{item}**, then model a reallocation in the recovery scenario."
    if "PRODUCT" in dim_up or "COMPONENT" in dim_up:
        return f"Prioritize replenishment and alternate sourcing for **{item}**, starting with the highest-value exposed orders."
    return "Trace the highest-impact records, assign an owner, and validate the mitigation in the recovery scenario before execution."


@st.cache_data(ttl=45)
def scenario_summary():
    return rows_from_query(
        f"""
        SELECT
          SCENARIO,
          COUNT(DISTINCT ORDER_ID) AS ORDER_COUNT,
          ROUND(SUM(EXPOSED_VALUE_RUPEES),2) AS TOTAL_EXPOSURE_INR,
          ROUND(AVG(ON_TIME_DELIVERY_FLAG)*100,2) AS OTD_RATE_PCT,
          ROUND(SUM(FULFILLED_QUANTITY)/NULLIF(SUM(QUANTITY),0)*100,2) AS FILL_RATE_PCT,
          ROUND(SUM(INVENTORY_ON_HAND_UNITS)/NULLIF(SUM(DAILY_DEMAND_UNITS),0),2) AS DAYS_OF_INVENTORY,
          ROUND(SUM(LANDED_COST_INR),2) AS TOTAL_LANDED_COST_INR
        FROM {TABLE}
        GROUP BY SCENARIO
        ORDER BY SCENARIO
        """
    )


def find_scenario(rows, scenario):
    return next(r for r in rows if r["SCENARIO"] == scenario)


def render_control_tower(active_scenario: str):
    st.markdown("<h1 class='ot-title'>Control Tower</h1>", unsafe_allow_html=True)
    st.markdown("<div class='ot-subtitle'>Governed operational view of supply-chain exposure and service metrics.</div>", unsafe_allow_html=True)
    rows = scenario_summary()
    row = find_scenario(rows, active_scenario)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Exposure", fmt_metric("TOTAL_EXPOSURE_INR", row["TOTAL_EXPOSURE_INR"]))
    c2.metric("On-time delivery", fmt_metric("OTD_RATE_PCT", row["OTD_RATE_PCT"]))
    c3.metric("Fill rate", fmt_metric("FILL_RATE_PCT", row["FILL_RATE_PCT"]))
    c4.metric("Days of inventory", fmt_metric("DAYS_OF_INVENTORY", row["DAYS_OF_INVENTORY"]))
    st.markdown("### Scenario comparison")
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_scenario_lab(active_scenario: str):
    st.markdown("<h1 class='ot-title'>Scenario Lab</h1>", unsafe_allow_html=True)
    st.markdown("<div class='ot-subtitle'>Compare disruption and recovery assumptions before making a decision.</div>", unsafe_allow_html=True)
    rows = scenario_summary()
    st.dataframe(rows, use_container_width=True, hide_index=True)
    a = find_scenario(rows, "ARUNA_4D")
    b = find_scenario(rows, "ARUNA_4D_RECOVERY")
    reduction = float(a["TOTAL_EXPOSURE_INR"]) - float(b["TOTAL_EXPOSURE_INR"])
    pct = reduction / float(a["TOTAL_EXPOSURE_INR"]) * 100 if float(a["TOTAL_EXPOSURE_INR"]) else 0
    st.success(f"Recovery reduces modeled exposure by {fmt_metric('TOTAL_EXPOSURE_INR', reduction)} ({pct:.1f}%).")
    st.caption(f"Active scenario: {active_scenario}")


def ensure_decision_table():
    session.sql(
        f"""
        CREATE TABLE IF NOT EXISTS {DB}.{SCHEMA}.ONTOTRAIL_DECISIONS (
            DECISION_ID VARCHAR,
            TITLE VARCHAR,
            PROBLEM VARCHAR,
            OWNER VARCHAR,
            PRIORITY VARCHAR,
            STATUS VARCHAR,
            SCENARIO VARCHAR,
            EXPECTED_OUTCOME VARCHAR,
            CREATED_BY VARCHAR,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
        )
        """
    ).collect()


def render_decision_board(active_scenario: str):
    ensure_decision_table()
    st.markdown("<h1 class='ot-title'>Decision Board</h1>", unsafe_allow_html=True)
    st.markdown("<div class='ot-subtitle'>Convert governed insight into an owned, traceable operational decision.</div>", unsafe_allow_html=True)
    with st.expander("Create decision", expanded=False):
        with st.form("decision_form", clear_on_submit=True):
            title = st.text_input("Decision title")
            problem = st.text_area("Evidence / problem")
            c1, c2, c3 = st.columns(3)
            owner = c1.text_input("Owner", value="Supply Planning")
            priority = c2.selectbox("Priority", ["High", "Medium", "Low"])
            status = c3.selectbox("Status", ["Proposed", "Assigned", "In progress", "Waiting for input", "Completed"])
            expected = st.text_area("Expected outcome")
            submitted = st.form_submit_button("Create decision", type="primary")
            if submitted and title.strip():
                decision_id = f"DEC-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
                user = getattr(st.user, "user_name", "unknown")
                safe = lambda s: str(s).replace("'", "''")
                session.sql(
                    f"""INSERT INTO {DB}.{SCHEMA}.ONTOTRAIL_DECISIONS
                    (DECISION_ID,TITLE,PROBLEM,OWNER,PRIORITY,STATUS,SCENARIO,EXPECTED_OUTCOME,CREATED_BY)
                    VALUES ('{safe(decision_id)}','{safe(title)}','{safe(problem)}','{safe(owner)}','{safe(priority)}',
                    '{safe(status)}','{safe(active_scenario)}','{safe(expected)}','{safe(user)}')"""
                ).collect()
                st.success(f"Created {decision_id}")
    decisions = rows_from_query(
        f"SELECT * FROM {DB}.{SCHEMA}.ONTOTRAIL_DECISIONS ORDER BY CREATED_AT DESC LIMIT 100"
    )
    if decisions:
        st.dataframe(decisions, use_container_width=True, hide_index=True)
    else:
        st.info("No decisions yet. Create one from an insight or use the form above.")


def init_chat():
    st.session_state.setdefault("threads", [{"id": "chat-1", "title": "New chat", "messages": []}])
    st.session_state.setdefault("active_thread", "chat-1")
    st.session_state.setdefault("projects", [])
    st.session_state.setdefault("active_scenario", "ARUNA_4D")


def current_thread():
    for thread in st.session_state.threads:
        if thread["id"] == st.session_state.active_thread:
            return thread
    return st.session_state.threads[0]


def new_chat():
    cid = f"chat-{len(st.session_state.threads)+1}-{int(datetime.utcnow().timestamp())}"
    st.session_state.threads.insert(0, {"id": cid, "title": "New chat", "messages": []})
    st.session_state.active_thread = cid


def render_ai_analyst(active_scenario: str):
    thread = current_thread()
    left, main = st.columns([0.24, 0.76], gap="medium")

    with left:
        st.markdown("### Chats")
        c1, c2 = st.columns(2)
        if c1.button("＋ New chat", use_container_width=True):
            new_chat()
            st.rerun()
        if c2.button("＋ Project", use_container_width=True):
            st.session_state.show_project_box = True
        if st.session_state.get("show_project_box"):
            with st.form("new_project"):
                pname = st.text_input("Project name")
                if st.form_submit_button("Create") and pname.strip():
                    st.session_state.projects.append(pname.strip())
                    st.session_state.show_project_box = False
                    st.rerun()
        for item in st.session_state.threads:
            label = item["title"] if len(item["title"]) <= 34 else item["title"][:31] + "…"
            if st.button(label, key=f"thread-{item['id']}", use_container_width=True):
                st.session_state.active_thread = item["id"]
                st.rerun()

    with main:
        st.markdown("<span class='ot-live'>LIVE · SNOWFLAKE CORTEX</span>", unsafe_allow_html=True)
        st.markdown(f"## {thread['title']}")
        st.caption(f"Current scenario: {active_scenario} · Grounded in {SEMANTIC_VIEW}")

        starter_cols = st.columns(3)
        starters = [
            "Which suppliers have the highest exposure?",
            "Compare ARUNA_4D and ARUNA_4D_RECOVERY exposure.",
            "Which plant has the lowest days of inventory?",
        ]
        for col, starter in zip(starter_cols, starters):
            if col.button(starter, key=f"starter-{starter}", use_container_width=True):
                st.session_state.pending_prompt = starter

        for msg in thread["messages"]:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])
                if msg.get("recommendation"):
                    st.markdown(f"<div class='ot-reco'><strong>Recommended next step</strong><br>{msg['recommendation']}</div>", unsafe_allow_html=True)
                if msg.get("data"):
                    st.dataframe(msg["data"], use_container_width=True, hide_index=True)
                if msg.get("sql"):
                    with st.expander("Audit trail · Generated SQL"):
                        st.code(msg["sql"], language="sql")
                if msg.get("request_id"):
                    st.caption(f"Snowflake request: {msg['request_id']}")

        prompt = st.chat_input("Ask a governed supply-chain question…")
        prompt = st.session_state.pop("pending_prompt", None) or prompt
        if prompt:
            if thread["title"] == "New chat":
                thread["title"] = prompt[:58] + ("…" if len(prompt) > 58 else "")
            thread["messages"].append({"role": "user", "content": prompt})
            with st.chat_message("user"):
                st.markdown(prompt)

            with st.chat_message("assistant"):
                status = st.status("Understanding your question…", expanded=True)
                status.write("Mapping the question to governed business terms")
                try:
                    result = ask_cortex(prompt, active_scenario)
                    status.write("Executing Snowflake-generated SQL")
                    answer = refined_answer(prompt, result)
                    reco = recommendation(prompt, result)
                    status.update(label="Answer ready", state="complete", expanded=False)
                    st.markdown(answer)
                    if reco:
                        st.markdown(f"<div class='ot-reco'><strong>Recommended next step</strong><br>{reco}</div>", unsafe_allow_html=True)
                    if result.get("data"):
                        st.dataframe(result["data"], use_container_width=True, hide_index=True)
                    if result.get("sql"):
                        with st.expander("Audit trail · Generated SQL"):
                            st.code(result["sql"], language="sql")
                    st.caption(f"Grounded in {SEMANTIC_VIEW} · Snowflake request {result.get('request_id') or 'n/a'}")
                    thread["messages"].append({
                        "role": "assistant",
                        "content": answer,
                        "recommendation": reco,
                        "data": result.get("data", []),
                        "sql": result.get("sql", ""),
                        "request_id": result.get("request_id", ""),
                    })
                except Exception as exc:
                    status.update(label="Could not complete the request", state="error")
                    st.error(str(exc))
                    thread["messages"].append({"role": "assistant", "content": f"Could not complete the request: {exc}"})
            st.rerun()


init_chat()

with st.sidebar:
    st.markdown(
        """
        <div class="ot-brand">
          <div class="ot-mark">O</div>
          <div><h2>OntoTrail</h2><p>Snowflake-native supply-chain intelligence</p></div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    page = st.radio(
        "Workspace",
        ["AI Analyst", "Control Tower", "Scenario Lab", "Decision Board", "Metric Governance"],
        label_visibility="collapsed",
    )
    st.divider()
    labels = list(SCENARIOS.keys())
    values = list(SCENARIOS.values())
    current_index = values.index(st.session_state.active_scenario)
    label = st.selectbox("Scenario", labels, index=current_index)
    st.session_state.active_scenario = SCENARIOS[label]
    st.caption(f"Signed in as {getattr(st.user, 'user_name', 'Snowflake user')}")
    st.caption("Native to Snowflake · Cortex Analyst · Semantic View")

active_scenario = st.session_state.active_scenario

if page == "AI Analyst":
    render_ai_analyst(active_scenario)
elif page == "Control Tower":
    render_control_tower(active_scenario)
elif page == "Scenario Lab":
    render_scenario_lab(active_scenario)
elif page == "Decision Board":
    render_decision_board(active_scenario)
else:
    st.markdown("<h1 class='ot-title'>Metric Governance</h1>", unsafe_allow_html=True)
    st.markdown("<div class='ot-subtitle'>Canonical definitions used consistently across planning, procurement and logistics.</div>", unsafe_allow_html=True)
    governance = [
        {"Metric": "Total exposure", "Semantic metric": "total_exposure_inr", "Meaning": "Sum of exposed order value"},
        {"Metric": "On-time delivery", "Semantic metric": "on_time_delivery_rate_pct", "Meaning": "Average on-time delivery flag × 100"},
        {"Metric": "Fill rate", "Semantic metric": "fill_rate_pct", "Meaning": "Fulfilled quantity ÷ ordered quantity × 100"},
        {"Metric": "Days of inventory", "Semantic metric": "days_of_inventory", "Meaning": "Inventory on hand ÷ daily demand"},
        {"Metric": "Total landed cost", "Semantic metric": "total_landed_cost_inr", "Meaning": "Sum of landed cost"},
    ]
    st.dataframe(governance, use_container_width=True, hide_index=True)
    st.info("Planning, procurement and logistics questions resolve through the same governed semantic view.")
