"use client";

import React, { useEffect, useMemo } from "react";
import { Drawer, Form, Input, InputNumber, Button, Space, Typography } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";

const { Text } = Typography;

export type WorkflowVariable = {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
  default?: any;
};

type WorkflowRunLauncherProps = {
  open: boolean;
  onClose: () => void;
  workflowVariables: Record<string, any>[];
  onRun: (payload: Record<string, any>) => void;
  isSubmitting?: boolean;
};

export function WorkflowRunLauncher({
  open,
  onClose,
  workflowVariables,
  onRun,
  isSubmitting = false
}: WorkflowRunLauncherProps) {
  const [form] = Form.useForm();

  const variables = useMemo(() => (workflowVariables || []) as WorkflowVariable[], [workflowVariables]);

  useEffect(() => {
    if (open) {
      // Set default values if any
      const initialValues: Record<string, any> = {};
      variables.forEach(variable => {
        if (variable.default !== undefined) {
          initialValues[variable.name] = variable.default;
        }
      });
      form.setFieldsValue(initialValues);
    } else {
      form.resetFields();
    }
  }, [open, variables, form]);

  const handleSubmit = (values: Record<string, any>) => {
    onRun(values);
  };

  return (
    <Drawer
      title="测试运行"
      placement="right"
      onClose={onClose}
      open={open}
      width={400}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => form.submit()}
            loading={isSubmitting}
          >
            发起运行
          </Button>
        </Space>
      }
    >
      {variables.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <Text type="secondary">当前工作流未定义变量，可直接运行</Text>
          <div style={{ marginTop: 24 }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => form.submit()}
              loading={isSubmitting}
            >
              发起运行
            </Button>
          </div>
        </div>
      ) : (
        <Form layout="vertical" form={form} onFinish={handleSubmit}>
          {variables.map((variable) => {
            const isNumber = variable.type === "number";
            return (
              <Form.Item
                key={variable.name}
                name={variable.name}
                label={
                  <span>
                    {variable.name}
                    {variable.description && (
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        {variable.description}
                      </Text>
                    )}
                  </span>
                }
                rules={[{ required: variable.required, message: `请输入 ${variable.name}` }]}
              >
                {isNumber ? (
                  <InputNumber style={{ width: "100%" }} placeholder={`请输入数值...`} />
                ) : (
                  <Input placeholder={`请输入文本...`} />
                )}
              </Form.Item>
            );
          })}
        </Form>
      )}
    </Drawer>
  );
}
