# Compass Assistant: production-readiness verification

Ngày kiểm chứng: 06/10/2026. Phạm vi: vertical slice đang có, không thêm feature.
Source of truth là code trong working tree, bao gồm implementation chưa commit của người dùng.

## Bugs found

| Severity | Cause | Fix | Regression test / evidence |
| --- | --- | --- | --- |
| High | Schema gửi tới OpenAI có `uniqueItems`; API thật trả HTTP 400 `invalid_json_schema`, làm chat trả 503. Transport fixture không biên dịch schema nên không bắt được. | Bỏ keyword không được hỗ trợ khỏi schema; giữ nguyên kiểm tra citation trùng ở server. | Assertion schema trong `test_openai_responses.py`; duplicate handles vẫn fail closed trong `test_compass_chat_api.py`; 5 generation thật đã thành công. |
| High | Account `student-demo` có mật khẩu công khai vẫn được seed/authenticate trong production; cookie cũ vẫn hợp lệ. | Production mặc định không seed, không authenticate và không authorize account này. Chỉ local demo/test bật `COMPASS_DEMO_AUTH=1`. | `production-auth.spec.ts`: production server riêng từ chối login và cookie demo đã lưu; đăng ký account riêng vẫn 201 và đọc documents 200. |
| High | Lease fencing dùng `request_id`; worker cũ và lượt retry cùng request ID có thể có cùng token. `failTurn` còn cập nhật user message trước khi xác nhận sở hữu lease. | Migration 003 thêm UUID cho từng lần acquire; finish/fail chỉ áp dụng đúng token. Fail thực hiện atomically trong transaction. | Test expire lease trong khi worker đầu vẫn chạy, retry cùng ID: worker cũ 409, worker mới 201, chỉ một user và một assistant message. |
| High | PostgreSQL khóa kết quả truy vấn “latest” bằng snapshot trước lúc chờ transaction khác; hai revision writer có thể cùng insert revision 2 rồi ném unique-constraint error. | Khóa baseline cố định trước, rồi chạy câu SELECT latest riêng sau khi acquire lock. | Test thật `test_two_sessions_allow_only_one_plan_child` đã fail khi chạy lại trước fix; sau fix bộ PostgreSQL và toàn backend pass, loser nhận `STALE_PLAN_REVISION`. |
| Medium | Citation fetch không phân biệt các lần click; response cũ chậm có thể ghi đè highlight mới. | Sequence counter bỏ response stale, xóa nguồn cũ khi bắt đầu click mới. | Browser delay response nguồn đầu, click nguồn cuối trên tài liệu dài: nguồn Gradient Descent vẫn được focus/highlight sau khi response đầu về. Desktop/mobile đều pass. |
| Medium | Lexical coverage tính cả từ hỏi tiếng Việt; query Gradient Descent có thể không đạt ngưỡng dù technical anchors đều xuất hiện. Ranking chưa boost heading. | Chấp nhận chunk có đủ explicit anchors; vẫn reject anchor không có trong tài liệu. Thêm heading boost. | 5-section document: top citation/chunk đúng Softmax, Cross Entropy và Gradient Descent; câu Transformer attention vẫn refusal. |
| Medium | Follow-up nhiều lượt chỉ ghép câu hỏi ngay trước; câu hỏi thứ ba có thể mất chủ đề gốc. | Lấy câu hỏi user gần nhất không phải pronoun follow-up trong history đã persist. | Softmax → exponential → nhược điểm; browser refresh rồi hỏi exponential; API restore và live-provider follow-up đều pass. |
| Medium | Re-upload document có status `failed` chỉ trả metadata cũ, không retry ingestion. | Retry cùng document ID; xóa partial chunks; ready re-upload giữ nguyên chunk IDs để không làm hỏng citation. | SQLite trigger làm ingestion fail sau chunk đầu: 422, status failed, zero chunks; bỏ trigger và re-upload: ready, đúng số chunks, không thêm document mới. |
| Medium | Sau khi turn đã lưu thành công, frontend fetch lại toàn bộ sessions; lỗi request phụ làm UI đánh dấu turn thành failed. | Cập nhật title/time/order session hiện tại từ kết quả send, bỏ GET phụ. | Chặn session-list GET bằng 503: turn vẫn hiển thị thành công, zero alert, zero reload call. |
| Medium | Model thật dịch `multiclass` thành “đa nhãn” trong một summary. | Prompt yêu cầu giữ technical distinctions, phân biệt đa lớp với đa nhãn; smoke assert thuật ngữ. | Lượt factual và summary thật sau fix không chứa “đa nhãn”; summary 5 chủ đề trả 5 citation đúng. Đây là kiểm chứng các ca cụ thể, không phải bảo đảm mọi câu trả lời của model. |

Hardening thêm: read citations cũng enforce document == session study set; test sửa dữ liệu SQLite thành citation cross-set và xác nhận API không trả citation đó. StudySet có key theo document ID để reset state khi thay nguồn. Heading metadata được bound ở 3.000 ký tự theo internal DTO. Các authorization lookup không đọc lại document BLOB; ghép citations theo message dùng Map thay vì filter toàn bộ citations cho từng message. ESLint bỏ qua generated test output để tránh race khi Playwright xóa thư mục output; không bỏ qua source/tests.

Schema fix đối chiếu với [OpenAI Docs: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses); bằng chứng keyword cụ thể bị từ chối là HTTP 400 từ provider thật.

## Actual request data flow

Với `Softmax là gì theo tài liệu này?`:

1. `AssistantPanel.send` giữ synchronous submitting ref, tạo UUID một lần; retry dùng lại UUID. POST JSON tới `/api/chat/sessions/{id}/messages` gồm question, active document ID, request ID.
2. `chatRoute` xác thực opaque cookie bằng hash/expiry trong `accounts.sqlite`, lấy owner từ server. Mutation kiểm tra Origin. JSON stream bị bound 16 KB; message tối đa 2.000 ký tự.
3. `sendChatMessage` lookup session bằng owner + session ID; xác nhận source document còn thuộc owner. Active document phải bằng `session.study_set_id`. Hiện mỗi Study Set là đúng một document; không có entity multi-document để client chọn tùy ý.
4. History lấy từ `chat_messages` đã persist, không nhận history/evidence/citations từ client. Chỉ lấy 8 turn hợp lệ gần nhất để generation; pronoun resolution phục vụ retrieval.
5. `beginTurn` kiểm tra request/content conflict, completed assistant và acquire lease trong `BEGIN IMMEDIATE`. Completed retry trả history đã lưu trước khi retrieval/generation. Pending user turn được lưu với uniqueness `(session_id, request_id, role)`.
6. `SqliteDocumentRetriever` tự authorize source; SQL join chunks/document có owner + document + ready status. Lexical ranking trả tối đa 6 đoạn nguồn. Không có evidence thì persist refusal và không gọi provider.
7. Next server POST các chunks đã cấp quyền cùng bounded history tới `/api/v1/internal/compass/answer`. Service key chỉ có ở server header; redirect bị reject, HTTP timeout 60 giây.
8. FastAPI check shared secret bằng timing-safe byte comparison trước DTO field validation. Nó không đọc private SQLite/retrieve tài liệu. Backend phát handles `c1...`, rồi `GroundedAnswerService` gọi Responses adapter với JSON input riêng và system instructions riêng.
9. Adapter gửi strict structured output tới OpenAI, `store=False`. Document/history được xác định là untrusted data; history chỉ giải pronoun, không làm evidence.
10. FastAPI validate handles thuộc đúng evidence request, loại duplicate/missing/fabricated handles. Next kiểm tra chunk IDs lần nữa với danh sách retrieval chính request đó. Invalid citations/refusal không tạo fallback citation.
11. `finishTurn` atomically xác nhận attempt token, insert assistant, kiểm tra source ownership + study set lần nữa trước insert citations và update user status.
12. Response trả messages/assistant/citations thật từ SQLite; UI render plain text và source buttons. Citation endpoint join owner + document ID + chunk ID; click fetch exact source card, focus/scroll/highlight.

Không có bước dùng owner, chunks, citation IDs hoặc history do client tự khai để thay thế authorization.

## Security verification

| Check | Kết quả đã kiểm chứng |
| --- | --- |
| Cross-user document | 404 cho document/session creation/active-document giả mạo; không trả filename. Authorization diễn ra trước retrieval/turn writes. |
| Cross-study-set | User sở hữu cả A/B nhưng session A + active B vẫn 404; session A vẫn zero messages sau request bị từ chối. |
| Cross-user chat session | GET history và POST message trả 404. Anonymous trả 401. |
| Chunk endpoint | Anonymous 401; owner khác 404; valid chunk ID dưới document sai cũng 404. |
| Session isolation | New conversation/history switching/refresh/Study Set B không mang messages hoặc source của A; quick action dùng B. |
| Internal service auth | Missing/wrong/unconfigured secret 403; unauthorized schema fields không được expose; Unicode configured key không gây 500. Public proxy không forward service key và không bypass internal auth. |
| Citation integrity | FastAPI handles và Next chunk IDs chỉ chấp nhận từ retrieval request; persistence và history reads enforce owner/set; fabricated citation không xuất hiện trong message_citations. |
| Prompt injection | LLM thật với đúng nội dung injection yêu cầu trả về giải thích Softmax factual; không trả `abc123`, không lộ prompt, citation tới chunk chứa factual source. |
| Frontend secrets | Scan 29 static build artifacts: không chứa API key đã cấu hình. `COMPASS_SERVICE_KEY` chỉ dùng trong server-only module; logs không in header/key/provider exception payload. |
| Production demo identity | Known password và persisted cookie demo bị từ chối mặc định; account riêng hoạt động. |

Network boundary: các scripts trong repo và smoke bind FastAPI ở `127.0.0.1`. Internal route nằm trên cùng FastAPI app, không có listener private riêng. Nếu deployment expose listener ra internet thì route vẫn có service authentication, nhưng **cấu hình ingress/firewall của deployment chưa được kiểm chứng**. Service key không thay user/document authorization; FastAPI nhận raw authorized chunks, không có khả năng lấy tài liệu private theo ID.

## Retrieval verification

Test document dài có Linear Regression, Logistic Regression, Softmax, Cross Entropy, Gradient Descent; mỗi section có nội dung riêng, lặp đủ dài để tạo nhiều chunks thật.

| Query | Kết quả |
| --- | --- |
| `Softmax dùng để làm gì?` | Top citation heading Softmax; fetch source chunk có nội dung Softmax. |
| `Cross entropy là gì?` | Top citation heading Cross Entropy; source nói negative log probability of true label. |
| `Gradient descent cập nhật tham số thế nào?` | Top heading Gradient Descent; source nói subtract learning rate times gradient. |
| `Transformer attention hoạt động thế nào?` với document chỉ Softmax/Cross Entropy | Persist đúng refusal, zero citations, provider call counter không tăng. |

FTS/vector DB/embeddings không được thêm. Lexical retrieval vẫn có giới hạn về synonym/semantic recall; các query trên đã kiểm chứng ranking thực tế, không chỉ status 200.

## Live LLM

**VERIFIED** — real OpenAI `gpt-5-mini-2025-08-07` + real retrieval + real SQLite + real HTTP APIs + production Next build.

Credential có sẵn trong `.env`; smoke chỉ đọc vào process environment, bật provider tạm thời và tạo ephemeral shared service key. Không chỉnh `.env`, không in secret, không mock transport.

Lượt chạy cuối gồm 5 generation thật:

- Factual Softmax: answered, 1 citation.
- Contextual exponential follow-up: answered, 1 citation.
- Follow-up nhược điểm sau restore API: answered, 1 citation.
- Exact prompt-injection document: answered, 1 citation.
- Long document, 5 distinct topics, summary: answered, 5 citations.

No-evidence là request thứ sáu: abstained, zero citations; cố ý không gọi LLM.
Thời gian lượt cuối: generation khoảng 6–7,2 giây; refusal khoảng 8 ms. Đây là smoke timings, không phải load benchmark.

Raw answers, citations, offsets và timings ở [live-results.json](../../artifacts/compass-verification/live-results.json). Script assert quan hệ message → citation → chunk → document → session Study Set → owner trong SQLite và fetch từng chunk qua API. Trước đó lỗi schema thật đã được quan sát và sửa; không dùng kết quả mock để gọi là live verified.

## Ingestion, migrations, concurrency and UI

- TXT, MD, `.markdown` ready; whitespace text 400; empty bytes 413; invalid/unsupported extension 400; PDF giữ khả năng đọc file cũ nhưng ingestion status unsupported, Assistant giải thích rõ chưa hỗ trợ extraction.
- Long Markdown tạo ordered chunks <=3.000 ký tự, exact text offsets, overlap; fenced-code headings không thành headings.
- Re-upload ready giữ nguyên chunk IDs. Failed partial ingestion không orphan chunks; retry phục hồi cùng document ID.
- SQLite clean migration, pre-Compass BLOB backfill, invalid UTF-8 failed backfill, repeated migration và upgrade từ migration 002 sang 003 pass. Original bytes không mất. `foreign_key_check` sạch; query plans dùng indexes cho chunks/document, messages/session, citations/message; sessions có owner/set index.
- Double send ở UI, concurrent API gửi cùng/khác request IDs, retry sau mất response đã commit và refresh khi generating không tạo duplicate messages. Provider counter xác nhận một call cho active duplicate/retry-after-commit; refusal zero calls.
- Test cố ý expire lease cho phép **replacement generation** để recover worker, nhưng worker cũ không thể commit/fail replacement. Không claim exactly-once external provider execution xuyên qua mọi crash/timeout; lease là recovery mechanism, không phải distributed transaction với OpenAI.
- Desktop/mobile: empty/first turn, messages, source buttons, 6 citations trên long document, loading, refusal, error/retry, long filename, history/new conversation/reopen, refresh/context, source race và study-set switching được browser tests kiểm chứng. Screenshots desktop/mobile được xem trực tiếp: [desktop](../../artifacts/compass-verification/desktop.png), [mobile](../../artifacts/compass-verification/mobile.png).
- Mobile dùng Chromium viewport 390×844 và native dialog; không giả định đây là kiểm chứng OS keyboard trên iOS/Android thật. Keyboard Enter trong textarea là newline; send đi qua form/button. UI synchronous guard và backend lease vẫn chống repeated submit.
- Không thêm redesign, OCR/PDF extraction, embeddings, flashcards, agents hoặc microservice.

## PostgreSQL gap

Cả 14 test trước đây skip đã chạy trên PostgreSQL 16 container riêng, database `compass_verify`, bind `127.0.0.1:55439`; không dùng/truncate database của người dùng.

Các test kiểm tra chính xác:

1. `test_migrations_apply_both_revisions_and_expose_import_constraints`: Alembic revisions, normalized schema/constraints.
2. `test_postgres_import_idempotency_conflict_provenance_and_safe_clear`: import duplicate/conflict/provenance/safe clear.
3. `test_import_rolls_back_when_the_transaction_fails`: import transaction rollback.
4. `test_canonical_http_thesis_scenario_survives_rebuilt_composition`: HTTP scenario/persistence qua rebuilt container.
5. `test_postgres_http_learning_loop`: HTTP learning loop với PostgreSQL.
6. `test_task_repository_contract`: task repository contract.
7. `test_execution_repository_contract`: execution repository contract.
8. `test_reflection_repository_contract`: reflection repository contract.
9. `test_study_plan_repository_contract`: study plan repository contract.
10. `test_typed_plan_and_reflection_round_trip`: typed plan/reflection roundtrip.
11. `test_postgres_http_plan_do_reflect_adapt`: HTTP plan/do/reflect/adapt.
12. `test_execution_rollback_is_real`: task/execution atomic rollback.
13. `test_restart_and_timezone_round_trip`: restart durability/timezone roundtrip.
14. `test_two_sessions_allow_only_one_plan_child`: concurrent revision writer race.

Private Compass data vẫn là Node SQLite; PostgreSQL tests kiểm tra planning persistence liên quan trong repo, không được mô tả nhầm là Compass PostgreSQL storage.

## Test results

| Command / suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Backend pytest, PostgreSQL configured | 1.576 | 0 | 0 |
| Trong đó PostgreSQL integration | 14 | 0 | 0 |
| Full Playwright desktop/mobile, production build | 134 | 0 | 0 |
| Compass-specific browser/migration checks, included above | 38 | 0 | 0 |
| Production authentication guard, included above | 2 | 0 | 0 |

TypeScript, ESLint, mypy (216 files), Ruff, production build và `git diff --check` pass.
Backend có 22 deprecation warnings từ Starlette/AnyIO và Alembic config; không disable/weaken tests để đạt green. Generated output bị ESLint ignore, source/test code vẫn được lint.

Reproduce:

```sh
# Disposable PostgreSQL only; tests truncate its tables.
docker run --detach --name compass-verification-postgres \
  --env POSTGRES_USER=compass_verify \
  --env POSTGRES_PASSWORD=local-verification-only \
  --env POSTGRES_DB=compass_verify \
  --publish 127.0.0.1:55439:5432 postgres:16-alpine

cd apps/api
HAUI_COMPASS_TEST_DATABASE_URL=postgresql+psycopg://compass_verify:local-verification-only@127.0.0.1:55439/compass_verify \
  uv run --extra dev pytest -q
uv run --extra dev ruff check src tests ../../scripts/verify_compass_live.py
uv run --extra dev mypy

cd ../web
npm run typecheck
npm run lint
npm run build
PLAYWRIGHT_USE_BUILD=1 PLAYWRIGHT_WEB_PORT=3300 npm test

cd ../..
apps/api/.venv/bin/python scripts/verify_compass_live.py --env-file .env
```

Shared service wiring cho chạy app ngoài smoke: FastAPI cần `HAUI_COMPASS_LLM_ENABLED=true`, `OPENAI_API_KEY`, `HAUI_COMPASS_LLM_MODEL`, `HAUI_COMPASS_LLM_TIMEOUT_SECONDS`; Next cần `COMPASS_API_URL`; cả hai cần cùng `COMPASS_SERVICE_KEY`. Cấu hình thiếu trả operational error thay vì mock answer. Existing tests kiểm tra opt-in/missing credential/config parsing, route missing key/unconfigured provider và fail-closed citations.

## Remaining release blockers

Không còn blocker được tái hiện trong vertical slice và những acceptance cases ở trên. Chưa chứng nhận deployment network/ingress, OS mobile keyboard, load/multi-instance vận hành hoặc semantic correctness của mọi output LLM. Đừng bật demo-account flag trên public deployment.

## Final verdict

**READY FOR MERGE**

Verdict áp dụng cho Compass slice và fixes đã kiểm chứng; không phải chứng nhận một deployment production chưa được cung cấp.
