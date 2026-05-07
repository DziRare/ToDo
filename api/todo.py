import os
from fastapi import FastAPI, HTTPException
from mangum import Mangum
from pydantic import BaseModel
from typing import Optional
import time
from uuid import uuid4
import boto3
from boto3.dynamodb.conditions import Key

app = FastAPI()
handler = Mangum(app)

@app.get("/")
def root():
  return {"message": "Hello World from Todo API"}

class PutTaskRequest(BaseModel):
  content: str
  user_id: Optional[str] = None
  task_id: Optional[str] = None
  is_done: bool = False

#Create tasks
@app.put("/create-task")
async def create_task(put_task_request: PutTaskRequest):
  created_time = int(time.time())
  item = {
    "user_id": put_task_request.user_id,
    "content": put_task_request.content,
    "is_done": False,
    "created_time": created_time,
    "task_id": f"task_{uuid4().hex}",
    "ttl": int(created_time + 86400), #Expire after 24 hours.
  }

  #Put tasks into table
  table = _get_table()
  table.put_item(Item=item)
  return {"task": item}

#Get the tasks from table
@app.get("/get-task/{task_id}")
async def get_task(task_id: str):
  table = _get_table()
  response = table.get_item(Key={"task_id": task_id})
  item = response.get("Item")

  if not item:
    raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
  return item

#List the top N tasks from table, using the user index.
@app.get("/list-tasks/{user_id}")
async def list_tasks(user_id: str):
  table = _get_table()
  response = table.query(
    IndexName="user-index",
    KeyConditionExpression=Key("user_id").eq(user_id),
    ScanIndexForward=False,
    Limit=10,
  )
  tasks = response.get("Items")
  return {"tasks": tasks}

#Update task in table
@app.put("/update-task")
async def update_task(put_task_request: PutTaskRequest):
  table = _get_table()
  table.update_item(
    Key={"task_id": put_task_request.task_id},
    UpdateExpression="SET content = :content, is_done = :is_done",
    ExpressionAttributeValues={
      ":content": put_task_request.content,
      ":is_done": put_task_request.is_done,
    },
    ReturnValues="ALL_NEW",
  )
  return {"updated_task_id": put_task_request.task_id}

#Delete task from table.
@app.delete("/delete-task/{task_id}")
async def delete_task(task_id: str):
  table = _get_table()
  table.delete_item(Key={"task_id": task_id})
  return {"deleted_task_id": task_id}

def _get_table():
  table_name = os.environ.get("TABLE_NAME")
  return boto3.resource("dynamodb").Table(table_name)