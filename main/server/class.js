class ProductionLine{
    constructor(line_id){
        this.line_id = line_id;
        this.session_id = null;//a
        this.start_time = null;//b
        this.operators = {
            supervisor: [],
            lineLeaders: [],
            waterjetOperators: [],
            formingOperators: [],
            assemblyOperators: [],
            qualityOperators: []
        };
        this.product_count = 0;//d
        this.product_reject = 0;//e
        this.mode = 'offline';//f
        this.hourly_output = 0;//g
        this.oee = 0;//h
        this.standard_cycle_time = 0;//i
        this.runtime_id = null;//j
        this.end_time = null;
        this.performance_pct=0;
        this.availability_pct=0;
        this.availability_pctm=0;
        this.quality_pct=0;
        this.hourly_plan= 0;
    }
    insertIntoLine(a,b,i,j,k,l,m,n,o,p,q,r){
        this.session_id = a
        this.start_time = b
        this.product_count = i;
        this.product_reject = j;
        this.mode = k;
        this.hourly_output = l;
        this.oee = m;
        this.standard_cycle_time = n;
        this.runtime_id = o;
        this.performance_pct=p;
        this.availability_pct=q;
        this.availability_pctm=q;
        this.quality_pct=r;
    }
    setOperators(role, names) {
    const roleMap = {
        supervisor: 'supervisor',
        lineLeader: 'lineLeaders',
        waterjet: 'waterjetOperators',
        forming: 'formingOperators',
        assembly: 'assemblyOperators',
        quality: 'qualityOperators' // fixed typo too
    };

    const key = roleMap[role];

    if (!key) {
        throw new Error(`Unknown role: ${role}`);
    }

    this.operators[key] = names; // names should be an array
}
    resetValue(){
        this.session_id = null;//a
        this.start_time = null;//b
        this.operators = {
            supervisor: [],
            lineLeaders: [],
            waterjetOperators: [],
            formingOperators: [],
            assemblyOperators: [],
            qualityOperators: []
        };
        this.product_count = 0;//i
        this.product_reject = 0;//j 
        this.mode = 'offline';//k
        this.hourly_output = 0;//l
        this.oee = 0;//m
        this.standard_cycle_time = 0;//n
        this.end_time = null;
        this.performance_pct=0;
        this.availability_pct=0;
        this.availability_pctm=0;
        this.quality_pct=0;
        this.hourly_plan=0;
    }
}

//add ons - target :

module.exports = { ProductionLine }
