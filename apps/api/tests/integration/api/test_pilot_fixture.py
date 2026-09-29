from datetime import datetime
from uuid import UUID
from fastapi.testclient import TestClient
from haui_compass.api.pilot_fixture import create_pilot_fixture_app
def test_reset_and_t2_creation():
 with TestClient(create_pilot_fixture_app()) as c:
  before=c.post('/api/v1/pilot-fixture/reset').json(); again=c.post('/api/v1/pilot-fixture/reset').json()
  assert before==again and before['courses']==4 and before['assignments']==5 and len(before['tasks'])==4
  assert sum((datetime.fromisoformat(w['ends_at'])-datetime.fromisoformat(w['starts_at'])).total_seconds() for w in before['study_windows'])==18000
  task_id=str(UUID(int=99)); result=c.post('/api/v1/tasks',json={'student':before['student'],'assignment':{'provider':'pilot-fixture','id':'reading-response'},'task_id':task_id,'title':'Summarise two articles','estimated_effort_minutes':45})
  assert result.status_code==200 and result.json()['status']=='not_started'
  after=c.get('/api/v1/demo/context').json(); assert len(after['tasks'])==5
