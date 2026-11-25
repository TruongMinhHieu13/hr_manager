import {
  AppSettings,
  CardTemplate,
  Department,
  Division,
  DocumentTemplate,
  Employee,
  ImportHistory,
  ParentDepartment,
  PrintHistory,
  SubDepartment,
  ResignationApplication,
  RenewContractPayload,
  ContractRecord,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface WorkspaceResponse {
  success: boolean;
  data: {
    employees: Employee[];
    divisions?: Division[];
    departments: Department[];
    subDepartments?: SubDepartment[];
    parentDepartments: ParentDepartment[];
    templates: CardTemplate[];
    importLogs: ImportHistory[];
    printLogs: PrintHistory[];
    settings: AppSettings | null;
  };
  error?: string;
}

export interface VietSunSyncPreview {
  success: boolean;
  apiUrl: string;
  pingMs: number;
  totalRemote: number;
  totalLocal: number;
  newCount: number;
  existingCount: number;
  onlyInLocalCount: number;
  remoteWithPhotosCount: number;
  sampleNewEmployees: Array<{
    msnv: string;
    fullName: string;
    department: string;
    joinDate?: string;
    hasPhoto?: boolean;
    syncAction: string;
  }>;
}

export const api = {
  async getWorkspace(){let e=await fetch(`${API_BASE}/workspace`);if(!e.ok)throw Error(`HTTP Error: ${e.status}`);let t=await e.json();if(!t.success)throw Error(t.error||`Lỗi tải workspace`);return t.data},

  async saveEmployee(e){let t=await(await fetch(`${API_BASE}/employees`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu nhân viên`);return t.employee},

  async updateEmployee(e,t){let n=await(await fetch(`${API_BASE}/employees/${e}`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)})).json();if(!n.success)throw Error(n.error||`Lỗi cập nhật nhân viên`);return n.employee},

  async getContracts(): Promise<ContractRecord[]> {
    const res = await fetch(`${API_BASE}/contracts`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Lỗi tải danh sách hợp đồng đã tạo (HTTP ${res.status})`);
    }
    return json.contracts || [];
  },

  async updateContract(
    id: string,
    updates: Partial<ContractRecord>
  ): Promise<{ success: boolean; contract: ContractRecord; employee?: Employee | null }> {
    const res = await fetch(`${API_BASE}/contracts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Lỗi cập nhật hợp đồng (HTTP ${res.status})`);
    }
    return json;
  },

  async deleteContract(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/contracts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Lỗi xóa hợp đồng (HTTP ${res.status})`);
    }
  },

  async getContractHistory(e){let t=await fetch(`${API_BASE}/contracts/${encodeURIComponent(e)}/history`),n=await t.json();if(!t.ok||!n.success)throw Error(n.error||`Lỗi tải lịch sử hợp đồng`);return n.contracts||[]},

  async getNextContractNumber(e=1){try{let t=await(await fetch(`${API_BASE}/contracts/next-number?count=${e}`)).json();return{nextContractNumber:t.nextContractNumber||`1080`,numbers:Array.isArray(t.numbers)?t.numbers:[t.nextContractNumber||`1080`]}}catch{return{nextContractNumber:`1080`,numbers:[`1080`]}}},

  async allocateContractNumbers(e){let t=await fetch(`${API_BASE}/contracts/allocate-numbers`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)}),n=await t.json();if(!t.ok||!n.success)throw Error(n.error||`Lỗi cấp số hợp đồng (HTTP ${t.status})`);return n},

  async toggleContractSigned(payload: {
    employeeIds: string[];
    isSigned: boolean;
    signDate?: string;
  }): Promise<{ success: boolean; message?: string; updatedEmployees: Employee[] }> {
    const res = await fetch(`${API_BASE}/contracts/toggle-signed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Lỗi cập nhật trạng thái ký hợp đồng (HTTP ${res.status})`);
    }
    return json;
  },

  async createContract(e){let t=await fetch(`${API_BASE}/contracts`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)}),n=await t.json();if(!t.ok||!n.success)throw Error(n.error||`Lỗi tạo hợp đồng mới`);return n},

  async renewContract(payload: RenewContractPayload): Promise<{
    success: boolean;
    employee: Employee;
    contract?: ContractRecord;
    message?: string;
  }> {
    const res = await fetch(`${API_BASE}/contracts/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Lỗi tái ký hợp đồng (HTTP ${res.status})`);
    }
    return json;
  },

  async updateProbationSalary(e,t,n){let r=typeof t==`string`?{luongThuViec:t,ghiChuHopDong:n}:t,i=await(await fetch(`${API_BASE}/employees/${e}/probation-salary`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify(r)})).json();if(!i.success)throw Error(i.error||`Lỗi cập nhật lương thử việc`);return i.employee},

  async batchUpdateProbationSalary(e,t){let n=await(await fetch(`${API_BASE}/employees/batch-probation-salary`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({ids:e,luongThuViec:t})})).json();if(!n.success)throw Error(n.error||`Lỗi cập nhật lương thử việc hàng loạt`);return n.employees},

  async batchUpdateSalaryRanks(e,t){let n=await(await fetch(`${API_BASE}/employees/batch-update-salary-ranks`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({items:e,contractType:t})})).json();if(!n.success)throw Error(n.error||`Lỗi cập nhật Lương / Bậc / Ngạch hàng loạt`);return n},

  async deleteEmployee(e){let t=await(await fetch(`${API_BASE}/employees/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa nhân viên`)},

  async batchDeleteEmployees(e){let t=await(await fetch(`${API_BASE}/employees/batch-delete`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({ids:e})})).json();if(!t.success)throw Error(t.error||`Lỗi xóa nhiều nhân viên`)},

  async batchPrintEmployees(e){let t=await(await fetch(`${API_BASE}/employees/batch-print`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({ids:e})})).json();if(!t.success)throw Error(t.error||`Lỗi cập nhật trạng thái in`)},

  async batchUpsertEmployees(e,t){let n=await(await fetch(`${API_BASE}/employees/batch-upsert`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({employees:e,importMode:t})})).json();if(!n.success)throw Error(n.error||`Lỗi import nhân viên`);return{importedCount:n.importedCount||0,updatedCount:n.updatedCount||0}},

  async previewSyncVietSun(e){let t=e?`?apiUrl=${encodeURIComponent(e)}`:``,n=await fetch(`${API_BASE}/employees/sync-vietsun/preview${t}`);if(!n.ok)throw Error(`HTTP Error: ${n.status}`);let r=await n.json();if(!r.success)throw Error(r.error||`Lỗi đối soát dữ liệu API`);return r},

  async syncVietSunEmployees(e={}){let t=await fetch(`${API_BASE}/employees/sync-vietsun`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)});if(!t.ok)throw Error(`HTTP Error: ${t.status}`);let n=await t.json();if(!n.success)throw Error(n.error||`Lỗi đồng bộ API Việt Sun`);return n},

  async saveDivision(e){let t=await(await fetch(`${API_BASE}/divisions`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu Khối`);return t.division},

  async updateDivision(e,t){let n=await(await fetch(`${API_BASE}/divisions/${e}`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)})).json();if(!n.success)throw Error(n.error||`Lỗi cập nhật Khối`);return n.division},

  async deleteDivision(e){let t=await(await fetch(`${API_BASE}/divisions/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa Khối`)},

  async reorderDivisions(e){let t=await(await fetch(`${API_BASE}/divisions/reorder`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify({orders:e})})).json();if(!t.success)throw Error(t.error||`Lỗi cập nhật thứ tự Khối`)},

  async saveDepartment(e){let t=await(await fetch(`${API_BASE}/departments`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu Phòng ban`);return t.department},

  async updateDepartment(e,t){let n=await(await fetch(`${API_BASE}/departments/${e}`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)})).json();if(!n.success)throw Error(n.error||`Lỗi cập nhật Phòng ban`);return n.department},

  async deleteDepartment(e){let t=await(await fetch(`${API_BASE}/departments/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa Phòng ban`)},

  async deleteAllDepartments(){let e=await(await fetch(`${API_BASE}/departments`,{method:`DELETE`})).json();if(!e.success)throw Error(e.error||`Lỗi xóa tất cả phòng ban`)},

  async reorderDepartments(e){let t=await(await fetch(`${API_BASE}/departments/reorder`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify({orders:e})})).json();if(!t.success)throw Error(t.error||`Lỗi cập nhật thứ tự phòng ban`)},

  async saveSubDepartment(e){let t=await(await fetch(`${API_BASE}/sub-departments`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu Phòng ban con`);return t.subDepartment},

  async updateSubDepartment(e,t){let n=await(await fetch(`${API_BASE}/sub-departments/${e}`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)})).json();if(!n.success)throw Error(n.error||`Lỗi cập nhật Phòng ban con`);return n.subDepartment},

  async deleteSubDepartment(e){let t=await(await fetch(`${API_BASE}/sub-departments/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa Phòng ban con`)},

  async reorderSubDepartments(e){let t=await(await fetch(`${API_BASE}/sub-departments/reorder`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify({orders:e})})).json();if(!t.success)throw Error(t.error||`Lỗi cập nhật thứ tự phòng ban con`)},

  async saveParentDepartment(e){let t=await(await fetch(`${API_BASE}/parent-departments`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu phòng ban cha`);return t.parentDepartment},

  async updateParentDepartment(e,t,n){let r=await(await fetch(`${API_BASE}/parent-departments/${e}`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:t,oldName:n})})).json();if(!r.success)throw Error(r.error||`Lỗi cập nhật phòng ban cha`);return r.parentDepartment},

  async deleteParentDepartment(e){let t=await(await fetch(`${API_BASE}/parent-departments/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa phòng ban cha`)},

  async deleteAllParentDepartments(){let e=await(await fetch(`${API_BASE}/parent-departments`,{method:`DELETE`})).json();if(!e.success)throw Error(e.error||`Lỗi xóa tất cả phòng ban cha`)},

  async reorderParentDepartments(e){let t=await(await fetch(`${API_BASE}/parent-departments/reorder`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify({orders:e})})).json();if(!t.success)throw Error(t.error||`Lỗi cập nhật thứ tự phòng ban cha`)},

  async saveTemplate(e){let t=await(await fetch(`${API_BASE}/templates`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu mẫu thẻ`);return{id:t.id}},

  async deleteTemplate(e){let t=await(await fetch(`${API_BASE}/templates/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa mẫu thẻ`)},

  async saveImportLog(e){let t=await(await fetch(`${API_BASE}/import-logs`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu nhật ký import`);return t.log},

  async savePrintLog(e){let t=await(await fetch(`${API_BASE}/print-logs`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu nhật ký in`);return t.log},

  async saveSettings(e){let t=await(await fetch(`${API_BASE}/settings`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu cài đặt`);return t.settings},

  async clearAllHistory(){let e=await(await fetch(`${API_BASE}/history/clear`,{method:`POST`,headers:{"Content-Type":`application/json`}})).json();if(!e.success)throw Error(e.error||`Lỗi xóa lịch sử`)},

  async seedSampleEmployees(){let e=await(await fetch(`${API_BASE}/seed-sample-employees`,{method:`POST`,headers:{"Content-Type":`application/json`}})).json();if(!e.success)throw Error(e.error||`Lỗi nạp nhân viên mẫu`)},

  async getDocumentTemplates(){let e=await(await fetch(`${API_BASE}/document-templates`)).json();if(!e.success)throw Error(e.error||`Lỗi tải danh sách mẫu văn bản`);return e.templates||[]},

  async saveDocumentTemplate(e){let t=await(await fetch(`${API_BASE}/document-templates`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu mẫu văn bản`);return t.template},

  async deleteDocumentTemplate(e){let t=await(await fetch(`${API_BASE}/document-templates/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa mẫu văn bản`)},

  async parseDocxFile(e){let t=await(await fetch(`${API_BASE}/document-templates/parse-docx`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({fileBase64:e})})).json();if(!t.success)throw Error(t.error||`Lỗi đọc file Word`);return{contentHtml:t.contentHtml,rawText:t.rawText}},

  async getResignationApplications(){let e=await(await fetch(`${API_BASE}/resignation-applications`)).json();if(!e.success)throw Error(e.error||`Lỗi tải danh sách đơn nghỉ việc`);return e.applications||[]},

  async saveResignationApplication(e){let t=await(await fetch(`${API_BASE}/resignation-applications`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi lưu đơn xin nghỉ việc`);return t.application},

  async deleteResignationApplication(e){let t=await(await fetch(`${API_BASE}/resignation-applications/${e}`,{method:`DELETE`})).json();if(!t.success)throw Error(t.error||`Lỗi xóa đơn xin nghỉ việc`);return t},

  async restoreEmployeeStatus(e){let t=await(await fetch(`${API_BASE}/employees/restore-status`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)})).json();if(!t.success)throw Error(t.error||`Lỗi khôi phục trạng thái nhân viên`);return t},

  async batchTerminateAndResign(e){let t=await(await fetch(`${API_BASE}/employees/batch-terminate-and-resign`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({items:e})})).json();if(!t.success)throw Error(t.error||`Lỗi xử lý import danh sách giảm`);return t;}
};
